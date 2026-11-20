import { and, eq, gt, lt, ne } from 'drizzle-orm'
import { decrypt, encrypt, hashToken, randomToken } from './crypto'
import type { Database } from './db/open'
import { login, spotifyAccount, type SpotifyAccount } from './db/schema'
import {
    getProfile,
    refreshAccessToken,
    SpotifyError,
    type OAuthClient,
    type SpotifyProfile,
    type TokenResponse
} from './spotify/oauth'

/** Spotify refresh tokens expire 6 months after the sign-in that issued them. */
export const REFRESH_TOKEN_LIFETIME_MS = 182 * 24 * 60 * 60 * 1000
/** From then on the account page warns that an account has to sign in again soon. */
export const EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000
/** How long a browser stays signed in. */
export const LOGIN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
/** Refresh access tokens this long before they expire. */
const ACCESS_TOKEN_MARGIN_MS = 60 * 1000

export type TokenStatus = 'ok' | 'expiring' | 'expired' | 'revoked'

/** What pages may see of an account: never the tokens. */
export interface AccountView {
    id: string
    displayName: string | null
    imageUrl: string | null
    /** Set for a player: the host it belongs to. */
    playerOf: string | null
    tokenExpiresAt: Date
    tokenStatus: TokenStatus
}

export interface AccountsDeps {
    db: Database
    key: Buffer
    client: OAuthClient
    now?: () => Date
}

/** Why an account cannot become a host's player. */
export type PlayerProblem = 'self' | 'host' | 'taken'

export function createAccounts({ db, key, client, now = () => new Date() }: AccountsDeps) {
    /** Refreshes running per account, so concurrent callers share one request. */
    const refreshing = new Map<string, Promise<string>>()

    function tokenExpiresAt(account: SpotifyAccount) {
        return new Date(account.authorizedAt.getTime() + REFRESH_TOKEN_LIFETIME_MS)
    }

    function tokenStatus(account: SpotifyAccount): TokenStatus {
        if (account.revokedAt) return 'revoked'
        const left = tokenExpiresAt(account).getTime() - now().getTime()
        if (left <= 0) return 'expired'
        return left <= EXPIRY_WARNING_MS ? 'expiring' : 'ok'
    }

    function find(accountId: string) {
        return db.query.spotifyAccount.findFirst({ where: eq(spotifyAccount.id, accountId) })
    }

    function view(account: SpotifyAccount): AccountView {
        return {
            id: account.id,
            displayName: account.displayName,
            imageUrl: account.imageUrl,
            playerOf: account.playerOf,
            tokenExpiresAt: tokenExpiresAt(account),
            tokenStatus: tokenStatus(account)
        }
    }

    /**
     * Updates only while the row still holds the refresh token this refresh started with, so a
     * sign-in that happened meanwhile is not overwritten or marked as revoked.
     */
    const unchanged = (account: SpotifyAccount) =>
        and(
            eq(spotifyAccount.id, account.id),
            eq(spotifyAccount.refreshToken, account.refreshToken)
        )

    /** The account has to sign in again (Spotify rejected the token, or APP_SECRET changed). */
    async function revoke(account: SpotifyAccount): Promise<never> {
        await db
            .update(spotifyAccount)
            .set({ revokedAt: now(), accessToken: null, accessTokenExpiresAt: null })
            .where(unchanged(account))
        throw new SpotifyError('The Spotify account has to sign in again', 401, true)
    }

    /** Decrypts a stored token; one encrypted with another APP_SECRET revokes the account. */
    async function decryptToken(account: SpotifyAccount, value: string): Promise<string> {
        try {
            return decrypt(value, key)
        } catch {
            return revoke(account)
        }
    }

    /** The statement that stores an account's tokens; await it alone or pass it to a batch. */
    function upsert(tokens: TokenResponse, profile: SpotifyProfile, playerOf?: string) {
        if (!tokens.refreshToken) throw new Error('Spotify sent no refresh token')
        const at = now()
        const values = {
            displayName: profile.displayName,
            imageUrl: profile.imageUrl,
            refreshToken: encrypt(tokens.refreshToken, key),
            accessToken: encrypt(tokens.accessToken, key),
            accessTokenExpiresAt: new Date(at.getTime() + tokens.expiresIn * 1000),
            scope: tokens.scope,
            authorizedAt: at,
            revokedAt: null,
            ...(playerOf && { playerOf })
        }
        return db
            .insert(spotifyAccount)
            .values({ id: profile.id, createdAt: at, ...values })
            .onConflictDoUpdate({ target: spotifyAccount.id, set: values })
    }

    /** Deletes an account; its sign-ins and its player go with it (ON DELETE CASCADE). */
    async function remove(accountId: string) {
        await db.delete(login).where(eq(login.accountId, accountId))
        await db.delete(spotifyAccount).where(eq(spotifyAccount.id, accountId))
    }

    async function refresh(account: SpotifyAccount): Promise<string> {
        const refreshToken = await decryptToken(account, account.refreshToken)
        let tokens: TokenResponse
        try {
            tokens = await refreshAccessToken(client, refreshToken)
        } catch (error) {
            if (error instanceof SpotifyError && error.invalidGrant) await revoke(account)
            throw error
        }
        await db
            .update(spotifyAccount)
            .set({
                accessToken: encrypt(tokens.accessToken, key),
                accessTokenExpiresAt: new Date(now().getTime() + tokens.expiresIn * 1000),
                ...(tokens.refreshToken && { refreshToken: encrypt(tokens.refreshToken, key) })
            })
            .where(unchanged(account))
        return tokens.accessToken
    }

    return {
        /**
         * Stores the tokens of a host's completed sign-in and the profile they belong to. A new
         * sign-in restarts the 6 months of the refresh token and clears a revocation.
         */
        async saveAuthorization(
            tokens: TokenResponse,
            profile?: SpotifyProfile
        ): Promise<SpotifyProfile> {
            profile ??= await getProfile(tokens.accessToken, client.fetch)
            await upsert(tokens, profile)
            return profile
        },

        /**
         * Stores the tokens of an account a host connected as their player, together with the link to
         * the host, so a half-done connection never leaves it looking like a host. A previous player
         * is deleted with its tokens. Check `playerProblem` first.
         */
        async connectPlayer(hostId: string, tokens: TokenResponse, profile: SpotifyProfile) {
            // A batch is atomic like a transaction, but does not hold the database's only
            // connection across awaits, which would make every parallel query fail
            await db.batch([
                db
                    .delete(spotifyAccount)
                    .where(
                        and(eq(spotifyAccount.playerOf, hostId), ne(spotifyAccount.id, profile.id))
                    ),
                upsert(tokens, profile, hostId)
            ])
        },

        /** A valid access token for the account, refreshed when needed. */
        accessToken(accountId: string): Promise<string> {
            // Registered before the first await, so concurrent callers share one lookup and refresh
            let promise = refreshing.get(accountId)
            if (promise) return promise
            promise = (async () => {
                const account = await find(accountId)
                if (!account) throw new Error(`Unknown Spotify account ${accountId}`)
                if (account.revokedAt)
                    throw new SpotifyError('The Spotify account has to sign in again', 401, true)
                if (
                    account.accessToken &&
                    account.accessTokenExpiresAt &&
                    account.accessTokenExpiresAt.getTime() - ACCESS_TOKEN_MARGIN_MS >
                        now().getTime()
                )
                    return decryptToken(account, account.accessToken)
                return refresh(account)
            })().finally(() => refreshing.delete(accountId))
            refreshing.set(accountId, promise)
            return promise
        },

        /** Forgets the access token, e.g. after Spotify answered 401 to it. */
        async invalidateAccessToken(accountId: string) {
            await db
                .update(spotifyAccount)
                .set({ accessToken: null, accessTokenExpiresAt: null })
                .where(eq(spotifyAccount.id, accountId))
        },

        async get(accountId: string): Promise<AccountView | null> {
            const account = await find(accountId)
            return account ? view(account) : null
        },

        /** The player a host connected, if any. */
        async player(hostId: string): Promise<AccountView | null> {
            const account = await db.query.spotifyAccount.findFirst({
                where: eq(spotifyAccount.playerOf, hostId)
            })
            return account ? view(account) : null
        },

        /**
         * Whether an account may become the host's player: not the host itself, not another host
         * (an account that signs in on its own), not another host's player.
         */
        async playerProblem(hostId: string, accountId: string): Promise<PlayerProblem | null> {
            if (accountId === hostId) return 'self'
            const account = await find(accountId)
            if (!account) return null
            if (account.playerOf === null) return 'host'
            return account.playerOf === hostId ? null : 'taken'
        },

        /** Deletes the host's player with its tokens; the host's own account plays again. */
        async removePlayer(hostId: string) {
            const player = await this.player(hostId)
            if (player) await remove(player.id)
        },

        /** Deletes a host with its player, tokens and sign-ins. */
        async removeHost(hostId: string) {
            await remove(hostId)
        },

        /** Signs a browser in; returns the token for its cookie. */
        async createLogin(accountId: string): Promise<{ token: string; expiresAt: Date }> {
            const token = randomToken()
            const createdAt = now()
            const expiresAt = new Date(createdAt.getTime() + LOGIN_LIFETIME_MS)
            await db.delete(login).where(lt(login.expiresAt, createdAt))
            await db
                .insert(login)
                .values({ tokenHash: hashToken(token), accountId, createdAt, expiresAt })
            return { token, expiresAt }
        },

        /** The account a login cookie belongs to, or null when it is unknown or expired. */
        async accountForLogin(token: string): Promise<AccountView | null> {
            const row = await db.query.login.findFirst({
                where: and(eq(login.tokenHash, hashToken(token)), gt(login.expiresAt, now()))
            })
            return row ? this.get(row.accountId) : null
        },

        async deleteLogin(token: string) {
            await db.delete(login).where(eq(login.tokenHash, hashToken(token)))
        }
    }
}

export type Accounts = ReturnType<typeof createAccounts>
