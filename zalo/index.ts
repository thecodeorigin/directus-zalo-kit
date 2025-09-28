import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import open from 'open'
import { match, P } from 'ts-pattern'
import { Zalo } from 'zca-js'

// Cấu hình chung
const zalo = new Zalo({
  selfListen: true,
  checkUpdate: true,
})

async function app() {
  console.log('Starting login process, please wait for the QR code...')
  const api = await zalo.loginQR({}, (qrPath) => {
    match(qrPath.data)
      .with({ image: P.string }, async (data) => {
        // Define a path for the temporary HTML file
        const tempFilePath = path.join(os.tmpdir(), `zalo-login-${Date.now()}.html`)

        // Create a professional HTML page to display the QR code
        const htmlContent = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>Zalo Login</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap');
              body {
                display: flex; justify-content: center; align-items: center;
                height: 100vh; margin: 0; background-color: #f0f2f5;
                font-family: 'Roboto', sans-serif;
              }
              .card {
                background-color: white; border-radius: 16px;
                padding: 40px; text-align: center;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
              }
              h1 { margin-top: 0; font-weight: 500; color: #0068ff; }
              p { color: #65676b; margin-bottom: 25px; }
              img { display: block; margin: 0 auto; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Scan to Log In</h1>
              <p>Open your Zalo app and scan the code below to continue.</p>
              <img src="data:image/png;base64,${data.image}" alt="Zalo QR Code Login" width="280" height="280">
            </div>
          </body>
          </html>
        `

        try {
          console.log('Generating QR page and opening in browser...')
          fs.writeFileSync(tempFilePath, htmlContent)
          await open(tempFilePath, { wait: false })
        }
        catch (error) {
          console.error('Failed to open browser:', error)
        }
      })
      .otherwise(() => {
        console.log('Received an unknown or invalid QR code format.')
      })
  })

  api.listener.start()

  api.listener.on('message', (msg) => {
    console.log('New message received:', msg)
  })

  api.listener.on('reaction', (msg) => {
    console.log('New reaction received:', msg)
  })

  console.log(`Successfully logged in as: ${api.getOwnId()}`)
}

app()
