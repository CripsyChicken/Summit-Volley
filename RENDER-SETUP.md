# Update your existing Render game

1. Extract `Summit-Volley-Source.zip` on your computer.
2. Open the extracted `Summit-Volley` folder. Upload **all its contents** to your GitHub repository, preserving the `src`, `dist`, `tests`, and `.github` folders. Replace existing files. Uploading only `index.html` or the ZIP will not update the server.
3. On the GitHub repository's main page, confirm that `package.json`, `package-lock.json`, `build.mjs`, `server.mjs`, `accounts.mjs`, and `account-store.mjs` appear beside the folders.
4. In Render, use a **Node Web Service**, with Root Directory blank (if those files are at the repository root).

| Setting | Value |
| --- | --- |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Instance | Free, for casual play |
| Node | 22, from the included `.node-version` |

## Enable saved accounts

Cookies remember a login. The database holds usernames, password hashes, coins, XP, quests, and owned cosmetics. Render's free filesystem is temporary, so local files cannot safely hold cloud accounts.

1. Create a free PostgreSQL project on [Neon](https://neon.com). Choose a region near your Render service.
2. In Neon, click **Connect**, select the database and role, and copy the PostgreSQL connection string. Keep its SSL parameters. Copy only the URL, without `psql`, quotes, or other shell text.
3. In Render, open your existing game service, then **Environment → Add Environment Variable**.
4. Set the **Key** to `DATABASE_URL` and the **Value** to that connection string.
5. Choose **Save, rebuild, and deploy**.
6. Open your Render game address. Click your name/level in the top right, expand **Sign in / create an account**, and register.

The tables are created automatically when the server starts. Do not paste the database URL into GitHub or the HTML. Leave `DATA_DIR` unset on free Render. Without `DATABASE_URL`, the game supports guest play and tells players that accounts are unavailable. It does not pretend that temporary account storage is durable.

The PostgreSQL adapter is included; you must supply your own database connection. The local file adapter and account HTTP flow were tested through a restart. The supplied release has not been connected to your Neon project or deployed to your Render account.

## Playing together

Everyone opens the **same Render game URL**. Choose **Online / LAN**, host a room, and share the six-character code. Choose the same team for co-op. Empty slots become AI teammates. There are up to six humans on each team and 12 players in a room.

Every online player uses their own **Player 1** keybinds. Player 2 keybinds are only for **Local versus** on one keyboard. Movement is relative to the screen, so players on the far side still use W to move toward the top of the screen. Mouse aiming works on either team.

The host selects the match size/difficulty from **Edit** on the main menu and the court in the clubhouse. A team automatically expands to fit joined humans. Select the same team before the host starts. Joining an active match is blocked; use the host's **Room lobby** button between matches. If a guest disconnects, AI takes over. If the host disconnects, the room closes.

## Saving and rewards

- Account sessions last up to 30 days. Sign out to revoke the cookie.
- Account progress loads on entry and saves after each completed online rally and match, and immediately after purchases/equips. Finishing a daily quest automatically collects its reward.
- Signed-in **Quick Match** creates a private online room against AI so it can award account progress.
- Practice and same-keyboard matches do not grant account rewards. Unsigned guest Quick Match and Local versus save their own separate progress in that browser.
- Guest progress does not merge into an account. Accounts are scoped to your game's database; clearing browser data removes guest progress but does not delete an account.
- The current account flow uses username/password, with no email collection or password recovery. Use a password manager.

## Hosting limits

This remains a casual game with physics running in the host's browser. The server validates messages, routes inputs, limits rooms, caps buffers, and issues duplicate-resistant rewards. It is not a competitive anti-cheat system: a modified host can falsify match state. Run one Node server instance; rooms live in memory. Host departure, redeployment, or server restart closes active rooms. Saved accounts remain in PostgreSQL.

12-socket integration tests pass. Each scene has at most 12 simple characters; snapshots run at 20 Hz and the database pool uses at most three connections. Real performance depends on the host computer and internet connection. Try Low graphics on a Chromebook. Free hosting bandwidth and compute quotas still apply.

References: [Render free service limits](https://render.com/docs/free), [Render environment variables](https://render.com/docs/configure-environment-variables), [Neon connection instructions](https://neon.com/docs/get-started/connect-neon).
