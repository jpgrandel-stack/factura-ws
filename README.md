# Factura WhatsApp → Claude

Recibe fotos de facturas por WhatsApp (via el Sandbox de Twilio) y usa la API de
Claude para extraer los datos necesarios para el formato 606 de la DGII.

## 1. Instalar dependencias

```bash
npm install
```

## 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y llena:
- `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`: los encuentras en el Account
  Dashboard de console.twilio.com.
- `ANTHROPIC_API_KEY`: la generas en console.anthropic.com → API Keys.

## 3. Probar localmente (opcional, con ngrok)

```bash
npm start
```

En otra terminal, expón tu puerto local a internet con ngrok:

```bash
ngrok http 3000
```

Copia la URL https que te da ngrok (algo como `https://abc123.ngrok-free.app`).

## 4. Conectar el webhook en Twilio

1. Ve a console.twilio.com → Messaging → Try it out → Send a WhatsApp message
   → pestaña "Sandbox settings".
2. En el campo **"When a message comes in"**, pega tu URL seguida de
   `/webhook`, por ejemplo:
   `https://abc123.ngrok-free.app/webhook`
3. Método: `POST`.
4. Dale "Save".

## 5. Probar

Manda una foto de una factura al número del sandbox de Twilio. Deberías
recibir de vuelta un mensaje confirmando los datos extraídos.

Puedes ver todas las facturas procesadas hasta ahora entrando a:
`https://tu-url/facturas`

## 6. Desplegar para que quede funcionando 24/7 (no depender de tu compu)

Cuando ya funcione en local, sube este proyecto a un repositorio de GitHub y
despliégalo en un servicio gratuito como **Render** (render.com):

1. Crea un "New Web Service" en Render, conectado a tu repo de GitHub.
2. Build command: `npm install`
3. Start command: `npm start`
4. Agrega las mismas variables de entorno (`TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `ANTHROPIC_API_KEY`) en la sección "Environment" de
   Render.
5. Una vez desplegado, Render te da una URL pública fija (ej:
   `https://factura-whatsapp.onrender.com`) — usa esa URL + `/webhook` en el
   campo de Twilio en vez de la de ngrok.

## Notas

- Este es un MVP: las facturas se guardan en memoria (se pierden si el
  servidor se reinicia). El siguiente paso natural es conectar una base de
  datos real (ej: Postgres) para persistirlas y luego generar el archivo 606
  desde ahí.
- El campo `confianza` que devuelve el modelo ayuda a detectar facturas que
  necesitan revisión manual antes de incluirse en el 606.
