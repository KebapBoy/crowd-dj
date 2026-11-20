# crowd-dj

A shared music queue for a room full of people. Someone starts a session, everyone joins with a link or QR code and adds music, and crowd-dj plays it **in turns** through one Spotify account on the room's speaker. Participants do not need a Spotify account.

## What it does

- **Sessions** with a join link and QR code. Participants pick a name once and are in: no account, no sign-in, no app to install.
- **A pool for everyone:** tracks you like, kept with your profile for every later session. When it is your turn, one of them plays at random.
- **Wishes:** a track you want to hear soon in this session.
- **In turns:** whoever has waited longest for a track of theirs comes next, so nobody takes over the music.
- **Three modes**, chosen by the host: wishes before pools, pools only, or wishes only.
- **Host settings:** anonymous sessions (nobody sees who added what) and limits per person (open wishes, wishes per session, how many pool tracks count).
- **Now playing and up next** on everyone's phone, updated live.
- **Find music** by searching tracks, albums and artists, or by pasting track links from the Spotify app.
- Light and dark theme, English and German.

## How it works

1. **The host** signs in with Spotify and starts a session. The music plays through the host's Spotify account, or through a second "player" account they connected (for example to keep their own listening history clean). Spotify has to be open on the device at the speaker.
2. **Everyone else** opens the join link or scans the QR code, picks a name and adds music: tracks to their pool, or wishes for right now.
3. **The host presses Play.** From then on crowd-dj picks the next track shortly before the current one ends and hands it to Spotify: in turns, by the session's mode, and never the same track twice in a session.
4. **When the evening is over**, the host ends the session, or it ends by itself after 30 minutes without music and without anyone having it open.

How the turns and the pools work in detail, and why crowd-dj is built the way it is, is explained in [docs/concept.md](docs/concept.md).

## crowd-dj or Spotify Jam?

Spotify's own [Jam](https://support.spotify.com/article/jam/) also lets a group fill one queue. It is built into the Spotify app and needs no setup, so for a few friends who all have Spotify it is often the simpler choice. crowd-dj is made for a room where not everyone has Spotify, and where the music should be shared fairly.

**What crowd-dj does that Jam does not:**

- **Anyone can join.** A browser and a name are enough. A Jam guest needs the Spotify app and an account (Free only in the same room, Premium to join from elsewhere).
- **Fair turns.** Whoever has waited longest for a track of theirs comes next. A Jam has one shared queue, so whoever adds the most gets the most played.
- **Pools that last.** Your favourite tracks stay with your profile and fill your turns in every session, also when you are not adding anything right now. A Jam fills gaps with Spotify's recommendations.
- **House rules.** The host sets how wishes and pools mix, limits per person and anonymous sessions. Participants add music, but cannot pause, skip or turn up the volume on the room's speaker.
- **It keeps going without the host.** The session runs on your server, so the host's phone can stay in their pocket or go home with them. A Jam ends when its host leaves.
- **Your own installation.** It runs on your server, with your data.

**What Jam does that crowd-dj does not:**

- **No setup.** Every Premium user can start a Jam in the Spotify app. crowd-dj needs a server, a Spotify developer app and allows at most 5 hosts and players.
- **Listening from elsewhere.** Premium guests hear the Jam on their own devices; crowd-dj plays only in the room.
- **Guests control the music.** In a Jam, guests can skip and change what plays (unless the host turns it off); crowd-dj has no skipping yet.
- **Everywhere Spotify is.** Joining by holding phones together, Jams that start by themselves on smart speakers, on TVs and in the car, and recommendations that take the group's taste into account.

## Using it

### Joining and profiles

- Open the join link or scan the QR code, pick a name, done. Everyone in a session can show the link and QR code to others (**Invite**).
- Your name is kept in your browser (**My profile**). Signed in with Spotify (as a host), you do not pick a name: your profile takes your first name from Spotify, or your Spotify username if there is none. The personal link and QR code there let you use the same profile on another device, for example your laptop. Anyone with that link can act as you, so only use it for your own devices.
- **Leave** (under **Participants**) takes you out of the turns; your open wishes no longer play, your pool stays. **Join again** brings you back.

### Music

Under **Music → Search** you find tracks, albums and artists (an artist opens their albums, an album its tracks). You can also paste links: in the Spotify desktop app, select tracks (Ctrl+A for a whole playlist), copy them (Ctrl+C) and paste them into the search field (up to 100 at a time). Each track has a menu:

- **Wish:** you want to hear it soon, in this session. Each track can be wished once per session; you can take your open wishes back (**Wishes** tab).
- **Add to pool:** you like it; it stays in your profile for every later session (**Pool** tab, and on **My profile**). Whole albums and all pasted tracks can be added at once. Adding a track again makes it your newest.

If the host set limits, they apply: a limit on wishes refuses further wishes, and a pool limit means only your newest tracks can play in that session (the older ones stay in your pool).

### Playing

The session page shows **Now playing** (cover, title, artists, for whom it plays) and **Up next**. Up next may still change until the track is handed to Spotify, for example when someone wishes a track.

- The host presses **Play** to start. If Spotify is not playing on any device, **Device** lists the devices of the playing account; pick the one at the speaker.
- If someone plays something else in the Spotify app on that account, the session pauses and the host can **Resume**. Pausing in the Spotify app just makes crowd-dj wait.
- If nothing is left to play and Spotify continues on its own (autoplay), crowd-dj lets it and plays the next wish or pool track after that track.

### For hosts

- **Start:** on the start page. You have at most one open session; starting again opens it.
- **Settings** (any time): how the next track is picked, anonymous, limits per person.
- **End:** ends the session for everyone; its link then shows "This session has ended".
- **My account:** connect, swap or disconnect a player account (Spotify shows its account dialog: pick "Not you?" and sign in with the player). See until when your sign-in and your player's are valid: Spotify requires signing in again every 6 months, and crowd-dj warns two weeks before. **Delete my account** removes your stored tokens and your player's and signs you out everywhere.

## What it does not do

- **No streaming to phones.** The music plays on the speaker of the playing account; Spotify's terms do not allow passing that sound on to several listeners, so crowd-dj never will.
- **At most 5 Spotify accounts per installation.** Spotify allows a self-made app only 5 users, hosts and players together. Participants do not count.
- **No skipping yet.** A track plays to its end. The skip settings in a session (skip own tracks, skip voting) are already there, but have no effect yet.
- **No playlists yet.** crowd-dj does not read Spotify playlists; to bring a whole playlist, copy its track links as described above.
- **The personal link of a profile cannot be revoked yet.** Whoever has it can use that profile.

## Coming up

Ideas that may come next. No promises and no dates, but this is where crowd-dj is heading:

- **Skip and skip voting.** The host skips any time, everyone may skip their own tracks, and the room votes the rest away: a track goes when enough people (and a big enough share of the room) want it gone.
- **Fill your pool from the Spotify app.** Add tracks to a shared inbox playlist right in Spotify, wherever you are, and they land in your pool: a permanent inbox per host, and one per session if the host likes. Link your Spotify profile once and crowd-dj knows which tracks are yours.
- **Listen along from anywhere.** Not in the room? Sign in with your own Spotify Premium and hear the same track at the same moment, in a browser tab or in your Spotify app.
- **Share to crowd-dj.** On Android, "Share → crowd-dj" in the Spotify app adds a track to your pool.
- **A shared player for the office.** A player account permanently connected to the room's speaker, with a start code: colleagues start a session on it without any Spotify sign-in of their own.
- **Reorder your wishes**, and **renew your personal link** so an old one stops working.

## Requirements

- A **Spotify app** from the [developer dashboard](https://developer.spotify.com/dashboard), owned by a Spotify Premium account. It stays in development mode, which allows at most 5 Spotify users.
- **Spotify Premium** for every host and every player, and a place for each on the app's allowlist (5 accounts in total). The allowlist decides who may host; crowd-dj has no admin of its own.
- A server with **Docker**, and a **reverse proxy with HTTPS** in front of it.

## Setting it up

1. Create a Spotify app. Under redirect URIs add `https://dj.example.com/auth/callback` (your `ORIGIN` plus `/auth/callback`). Add every host and every player account to the allowlist (User Management).
2. Use [deploy/compose.yaml](deploy/compose.yaml), for example as a git stack with that compose path, and set the variables below in the environment of the stack. Every variable is explained in [.env.example](.env.example).
3. Point your reverse proxy at the container on port 3000. Do not publish port 3000 next to the proxy: a client talking to it directly could fake its address.
    - **Live updates** are server-sent events (`/s/<id>/events`). crowd-dj asks proxies not to buffer them (`X-Accel-Buffering: no`, which nginx and SWAG follow) and sends a ping every 25 seconds, so the usual read timeouts of 60 seconds are fine.
    - **Visitor addresses:** crowd-dj limits new profiles per visitor address, so the proxy has to set or append `X-Forwarded-For` (SWAG, Caddy, Traefik and nginx with `$proxy_add_x_forwarded_for` do), and `XFF_DEPTH` has to match the number of proxies that append to it (the compose file assumes one). Without the header the log says so once, and all visitors share one limit.
4. Hosts sign in from the start page; on **My account** they can connect a player.

The database is created and migrated when the server starts.

### Configuration

| Variable                | Purpose                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                | Public URL without a trailing slash; the Spotify redirect URI is `<ORIGIN>/auth/callback`                                                    |
| `DATABASE_URL`          | SQLite database file as a libsql URL (the image sets `file:/data/crowd-dj.db`)                                                               |
| `SPOTIFY_CLIENT_ID`     | Client ID of the Spotify app                                                                                                                 |
| `SPOTIFY_CLIENT_SECRET` | Client secret of the Spotify app (secret)                                                                                                    |
| `APP_SECRET`            | Key for encrypting stored tokens (secret, at least 32 characters; `openssl rand -base64 32`). Changing it makes every account sign in again  |
| `ADDRESS_HEADER`        | Request header with the visitor's address behind a reverse proxy, used to limit new profiles per address (compose default `X-Forwarded-For`) |
| `XFF_DEPTH`             | How many proxies append to `X-Forwarded-For` (compose default `1`)                                                                           |
| `TZ`                    | Time zone                                                                                                                                    |

## Contributing

How to work on the code is in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
