import { and, asc, eq, gt, lt } from 'drizzle-orm'
import { decrypt, encrypt, hashToken, randomToken } from './crypto'
import type { Database } from './db/open'
import { login, SETTING, setting, spotifyAccount, type SpotifyAccount } from './db/schema'
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
/** From then on the admin page warns that an account has to sign in again soon. */
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
    approved: boolean
    isAdmin: boolean
    isRoom: boolean
    tokenExpiresAt: Date
    tokenStatus: TokenStatus
}

export interface AccountsDeps {
    db: Database
    key: Buffer
    client: OAuthClient
    adminId: string
    now?: () => Date
}

export function createAccounts({ db, key, client, adminId, now = () => new Date() }: AccountsDeps) {
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

    async function roomAccountId(): Promise<string | null> {
        const row = await db.query.setting.findFirst({
            where: eq(setting.key, SETTING.roomAccountId)
        })
        return row?.value ?? null
    }

    function view(account: SpotifyAccount, roomId: string | null): AccountView {
        return {
            id: account.id,
            displayName: account.displayName,
            imageUrl: account.imageUrl,
            approved: account.id === adminId || account.approvedAt !== null,
            isAdmin: account.id === adminId,
            isRoom: account.id === roomId,
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
         * Stores the tokens of a completed sign-in and the profile they belong to. A new sign-in
         * restarts the 6 months of the refresh token and clears a revocation.
         */
        async saveAuthorization(
            tokens: TokenResponse,
            profile?: SpotifyProfile
        ): Promise<SpotifyProfile> {
            if (!tokens.refreshToken) throw new Error('Spotify sent no refresh token')
            profile ??= await getProfile(tokens.accessToken, client.fetch)
            const at = now()
            const values = {
                displayName: profile.displayName,
                imageUrl: profile.imageUrl,
                refreshToken: encrypt(tokens.refreshToken, key),
                accessToken: encrypt(tokens.accessToken, key),
                accessTokenExpiresAt: new Date(at.getTime() + tokens.expiresIn * 1000),
                scope: tokens.scope,
                authorizedAt: at,
                revokedAt: null
            }
            await db
                .insert(spotifyAccount)
                .values({ id: profile.id, createdAt: at, ...values })
                .onConflictDoUpdate({ target: spotifyAccount.id, set: values })
            return profile
        },

        /** A valid access token for the account, refreshed when needed. */
        accessToken(accountId: string): Promise<string> {
            // Registered before the first await, so concurrent callers share one lookup and refresh
            let promise = refreshing.get(accountId)
            if (promise) return promise
            promise = (async () => {
                const account = await db.query.spotifyAccount.findFirst({
                    where: eq(spotifyAccount.id, accountId)
                })
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
            const account = await db.query.spotifyAccount.findFirst({
                where: eq(spotifyAccount.id, accountId)
            })
            return account ? view(account, await roomAccountId()) : null
        },

        async list(): Promise<AccountView[]> {
            const [accounts, roomId] = await Promise.all([
                db.query.spotifyAccount.findMany({ orderBy: asc(spotifyAccount.createdAt) }),
                roomAccountId()
            ])
            return accounts.map((account) => view(account, roomId))
        },

        async roomAccount(): Promise<AccountView | null> {
            const roomId = await roomAccountId()
            return roomId ? this.get(roomId) : null
        },

        async setRoomAccount(accountId: string | null) {
            if (accountId === null) {
                await db.delete(setting).where(eq(setting.key, SETTING.roomAccountId))
                return
            }
            await db
                .insert(setting)
                .values({ key: SETTING.roomAccountId, value: accountId })
                .onConflictDoUpdate({ target: setting.key, set: { value: accountId } })
        },

        /**
         * Makes another account the room account, or none. The previous one is deleted with its
         * tokens unless it also signs in on its own (the admin, an approved host, or signed in).
         */
        async replaceRoomAccount(accountId: string | null) {
            const previousId = await roomAccountId()
            await this.setRoomAccount(accountId)
            if (!previousId || previousId === accountId || previousId === adminId) return
            const previous = await db.query.spotifyAccount.findFirst({
                where: eq(spotifyAccount.id, previousId)
            })
            const signedIn = await db.query.login.findFirst({
                where: and(eq(login.accountId, previousId), gt(login.expiresAt, now()))
            })
            if (previous && !previous.approvedAt && !signedIn) await this.remove(previousId)
        },

        async setApproved(accountId: string, approved: boolean) {
            await db
                .update(spotifyAccount)
                .set({ approvedAt: approved ? now() : null })
                .where(eq(spotifyAccount.id, accountId))
        },

        /** Deletes the account with its tokens and sign-ins. The admin account cannot be removed. */
        async remove(accountId: string) {
            if (accountId === adminId) throw new Error('The admin account cannot be removed')
            if ((await roomAccountId()) === accountId) await this.setRoomAccount(null)
            await db.delete(login).where(eq(login.accountId, accountId))
            await db.delete(spotifyAccount).where(eq(spotifyAccount.id, accountId))
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
