# Summit Volley

A complete cel-shaded 3D volleyball game with manual aiming, AI teams, customizable controls, same-keyboard multiplayer, 12-player online/LAN rooms, co-op teams, saved accounts, quests, coins, levels, skins, and court themes.

For your Render deployment, follow **[RENDER-SETUP.md](RENDER-SETUP.md)**. It includes the complete upload checklist and the `DATABASE_URL` setting needed for durable cloud accounts.

## Play offline

Open **index.html** in a modern browser. The standalone **Summit-Volley.html** download contains the same game. Quick Match, Practice, and Local versus work offline, with no server or CDN. Team sizes range from 1v1 to 6v6; extra players are AI. Matches are first to 7, 11, or 21, win by two.

## Customize both players' controls

Open **Settings → Player 1 controls** or **Player 2 controls**. Click an action, then press a new key or mouse button. Controls save in that browser. Escape cancels capture and remains the pause key. Reset restores only the selected player's defaults.

A duplicate key within one player swaps the two actions. A warning appears if the other player also uses that key; both respond in same-keyboard matches. On separate online/LAN devices, everyone uses their own Player 1 profile. Player 2 is exclusively for same-keyboard play.

| Action | Player 1 default | Player 2 default |
| --- | --- | --- |
| Move forward / left / backward / right | W / A / S / D | I / J / K / L |
| Aim | Mouse, or Num 8 / 4 / 2 / 6 | Arrow keys |
| Bump / receive | E | O |
| Set | Right mouse | U |
| Hit / serve | Hold and release left mouse | Hold and release P |
| Jump | Space | Right Alt |
| Block near the net | F | Semicolon |
| Sprint | Left Shift | Right Shift |
| Pause | Escape | Escape |

Move under the ball until the contact prompt appears. Bump makes a controlled receiving shot, set lifts the ball onto your side, and hit becomes a spike when airborne with a high ball. Hold jump for more height. Gold/coral rings show shot targets; the dotted ring predicts the current ball's landing. Movement follows the screen for both players, including Player 2 on the far side.

There are three touches per side; repeated touches by one player are allowed as an arcade rule. Lines count as in. Practice has unlimited contacts, gold targets, new serves, and a ball machine. R and T are practice shortcuts unless rebound to another action.

## Online, LAN, and co-op

Install Node.js 22. In the extracted project folder, run:

```sh
npm ci
npm run build
npm start
```

For LAN, everyone opens the LAN address printed by the server on the same network. For internet play, everyone opens the same Render address. Choose **Online / LAN → Host room** and share the six-character code. Friends choose **Join room**, then select a team. Pick the same team for co-op. The host starts the match. Up to six humans can join each side; the match size grows to fit them, with AI filling empty slots.

The host browser runs physics and AI. Every guest sends their own inputs using **Player 1 controls**. Guests' menus stop their own input; host pause stops the match. Host departure closes the room; a disconnected guest becomes an AI substitute. Use **Room lobby (host)** in the pause/end screen to return the group to team selection. New players join between matches.

## Accounts and progression

Click your name/level at the top right to open the clubhouse. Create a username/password account on the game server, or use a separate browser-local guest profile. Accounts remember sign-in with a 30-day HttpOnly cookie. Progress is stored on the server, never in the cookie.

Local servers save accounts in ignored `data/accounts.json` using serialized atomic writes. Back up this directory. On Render, set **DATABASE_URL** to a durable PostgreSQL database such as Neon; follow **RENDER-SETUP.md**. Free Render without a database keeps account creation disabled instead of saving accounts to temporary storage. Database tables are created automatically.

Account progress loads on entry and saves after rallies, completed matches, and cosmetic changes. Signed-in Quick Match hosts a private room against AI for account rewards. Practice and same-keyboard modes do not award account progress. Guest Quick Match and Local versus save separate guest progress locally. Guest progress does not merge into accounts. Local keybinds remain device-specific.

Earn coins and XP from rallies and matches. Three daily quests reward rallies, clean touches, and wins, with automatic collection and a midnight UTC reset. Levels grow with XP. Five outfits and four court themes are available; all upgrades are cosmetic. The host chooses the shared court. Usernames and levels appear in the lobby and above players.

Passwords use salted asynchronous scrypt; sessions use random tokens stored as hashes, SameSite cookies, and Secure cookies on Render. Auth requests have same-origin and rate checks. SQL uses parameters and row locks; rewards are idempotent. There is no email collection or password recovery in this version.

## Upload to GitHub

The downloadable source ZIP excludes private Site configuration, credentials, node_modules, and local Git history.

1. Create a GitHub repository.
2. Extract the ZIP and upload the **contents of the Summit-Volley folder** to the repository root. Include `index.html`, source folders, `dist`, tests, package files, server, build script, and documentation. Or use Git:

   ```sh
   git init
   git add .
   git commit -m "Add Summit Volley"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

   Replace the example repository URL with your own.

3. For a public playable page, open **Settings → Pages** in GitHub. Choose **Deploy from a branch**, **main**, and **/(root)**, then save. GitHub will provide the deployed URL.
4. The root `index.html` already contains the built game; repository subpaths work without additional setup.

**GitHub Pages runs solo and same-keyboard play. It does not run the Node/WebSocket LAN server.** For LAN, download or clone the repository, run the local server, and use its LAN address. Uploading the source to GitHub does not create an online multiplayer service.

After editing source, run `npm run build` and commit the updated `index.html` and `dist/index.html`. The included GitHub Actions workflow tests and builds on pushes/pull requests; it does not modify files or deploy a server.

Official reference: [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Development

```sh
npm ci
npm test
npm run build
npm start
```

The build emits identical self-contained HTML files at the repository root and in `dist`. Browser dependencies are bundled. LAN connections are opened only when requested.

| File | Purpose |
| --- | --- |
| `src/game.js` | Gameplay, movement, AI, scoring, menus |
| `src/bindings.js`, `src/controls-ui.js` | Defaults, capture, labels, persisted controls |
| `src/lan.js`, `src/lan-game.js` | Connections, input, snapshots, interpolation, lifecycle |
| `src/lan-protocol.js` | Shared protocol validation |
| `server.mjs` | HTTP, 12-player WebSocket rooms, teams, validated reward events |
| `accounts.mjs`, `account-store.mjs` | Cookie auth, local/PostgreSQL persistence, transactions |
| `src/clubhouse.js`, `src/progression.js` | Profile UI, quests, XP, coins, cosmetics |
| `src/physics.js` | Gravity, trajectories, swept net/floor collision, line decisions |
| `src/scene.js` | Court, scenery, characters, camera, effects, toon shading |
| `src/software-renderer.js` | Compatibility 3D renderer without WebGL |
| `src/audio.js` | Procedural Web Audio effects |
| `src/index.html`, `src/style.css` | Responsive interface |
| `tests/` | Controls, gameplay, physics, real-socket LAN integration tests |

## Performance and validation

Low-polygon models, batched scenery, capped pixel density, and one shadow map keep GPU rendering lightweight. Low graphics disables real shadows. The software fallback uses the same 3D scene and physics with cached scenery, simpler characters, and a fixed wide camera. Physics runs at 120 Hz with bounded catch-up; LAN state is sent at up to 20 Hz.

The server caps 12 players per room and eight rooms per instance, validates inputs, limits payloads and buffers, and cleans up disconnected sockets. A PostgreSQL pool uses at most three connections. Casual host-authoritative play is not an anti-cheat system: a modified host can falsify match results. Run one instance; rooms do not survive server restarts, but database accounts do. 12-socket integration tests exercise capacity and routing; internet latency and hardware still affect play.

Automated tests cover default/custom controls, independent movement and aim, charging, ball trajectories, collisions, scoring, blocking, pause, practice, complete AI matches, real socket host/join, input and ball replication, pause/resume, rematch, full rooms, reconnecting a guest, and malformed requests. Browser rendering is checked with the available compatibility renderer; GPU visuals cannot be verified in that preview environment.

All game models, textures, scenery, and sounds are generated in code. Three.js and the server's ws and pg dependencies use MIT licenses; see `THIRD-PARTY-LICENSES.txt`.
