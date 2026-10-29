# Summit Volley

A complete cel-shaded 3D volleyball game with manual aiming, AI teams, customizable controls, same-keyboard multiplayer, and two-device LAN matches.

## Play offline

Open **index.html** in a modern browser. The standalone **Summit-Volley.html** download contains the same game. Quick Match, Practice, and Local versus work offline, with no server or CDN. Team sizes range from 1v1 to 6v6; extra players are AI. Matches are first to 7, 11, or 21, win by two.

## Customize both players' controls

Open **Settings → Player 1 controls** or **Player 2 controls**. Click an action, then press a new key or mouse button. Controls save in that browser. Escape cancels capture and remains the pause key. Reset restores only the selected player's defaults.

A duplicate key within one player swaps the two actions. A warning appears if the other player also uses that key; both respond in same-keyboard matches. On separate LAN devices, profiles can use any preferred bindings.

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

## LAN on two devices

The HTML file alone cannot start a server. Use the included Node server:

1. Extract the project on the host computer. Install **Node.js 20 or newer** if needed.
2. Open a terminal in the project folder:

   ```sh
   npm install
   npm start
   ```

3. The terminal prints localhost and a LAN address, such as `http://192.168.1.23:3000`. Use your actual printed address, not this example.
4. On the host, open that address, choose the match setup, then **LAN multiplayer → Host room**.
5. On the second device, connected to the same Wi-Fi or Ethernet network, open the **same LAN address**, choose LAN multiplayer, and enter the host's six-character room code.
6. The host clicks **Start LAN match**. The host uses Player 1 controls; the guest uses Player 2 controls. Each device can customize its own profile in Settings.

Keep the Node server and host tab open. The host browser owns physics, AI, scores, and match state; the guest sends inputs. Updates use WebSockets and guest interpolation. Either player can pause the shared match. Only the host can restart/rematch. If a guest leaves, the host keeps the room code and can start a new match after someone rejoins. Host departure closes the room.

If another device cannot connect, check the printed address, allow Node through the computer's firewall on the private network, and check whether the router isolates Wi-Fi clients. No internet port forwarding is needed. The default port is 3000. Change it with `PORT=3001 npm start` on Linux/macOS, or `$env:PORT=3001; npm start` in PowerShell.

## Performance and validation

Low-polygon models, batched scenery, capped pixel density, and one shadow map keep GPU rendering lightweight. Low graphics disables real shadows. The software fallback uses the same 3D scene and physics with cached scenery, simpler characters, and a fixed wide camera. Physics runs at 120 Hz with bounded catch-up; LAN state is sent at up to 30 Hz.

The LAN server includes room capacity, input/payload limits, role checks, same-origin browser checks, heartbeat, and disconnect cleanup. It is intended for friendly LAN matches, not a public competitive service.

Automated tests cover default/custom controls, independent movement and aim, charging, ball trajectories, collisions, scoring, blocking, pause, practice, complete AI matches, real socket host/join, input and ball replication, pause/resume, rematch, full rooms, reconnecting a guest, and malformed requests. Browser rendering is checked with the available compatibility renderer; GPU visuals cannot be verified in that preview environment.

All game models, textures, scenery, and sounds are generated in code. Three.js and the server's ws dependency use MIT licenses; see `THIRD-PARTY-LICENSES.txt`.
