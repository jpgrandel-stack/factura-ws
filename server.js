// server.js
// Recibe fotos de facturas por WhatsApp (via Twilio Sandbox) y extrae los
// datos relevantes (RNC, NCF, fecha, monto, ITBIS) usando la API de Claude.

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const twilio = require('twilio');

const app = express();

// Twilio manda el webhook como application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  ANTHROPIC_API_KEY,
  PORT = 3000,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !ANTHROPIC_API_KEY) {
  console.warn(
    '[AVISO] Falta configurar TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o ANTHROPIC_API_KEY en el archivo .env'
  );
}

// Guardamos las facturas procesadas en memoria por ahora (MVP).
// Para producción esto debe ir a una base de datos real.
const facturasProcesadas = [];

/**
 * Descarga un archivo de media de Twilio (requiere autenticación básica
 * con el Account SID y el Auth Token).
 */
async function descargarMediaDeTwilio(mediaUrl) {
  const respuesta = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    auth: {
      username: TWILIO_ACCOUNT_SID,
      password: TWILIO_AUTH_TOKEN,
    },
  });
  return Buffer.from(respuesta.data);
}

/**
 * Llama a la API de Claude con la imagen de la factura y le pide que
 * devuelva únicamente un JSON con los campos que necesitamos para el 606.
 */
async function extraerDatosFactura(imagenBase64, mediaType) {
  const promptSistema = `Eres un asistente que extrae datos de facturas dominicanas para
el formato 606 de la DGII. Devuelve ÚNICAMENTE un objeto JSON (sin texto adicional,
sin backticks de markdown) con estos campos:
{
  "rnc_proveedor": string o null,
  "tipo_identificacion": "1" (RNC) o "2" (Cedula) o null,
  "ncf": string o null,
  "ncf_modificado": string o null,
  "fecha_comprobante": "DD/MM/AAAA" o null,
  "monto_facturado": number o null,
  "itbis_facturado": number o null,
  "confianza": "alta" | "media" | "baja"
}
Si algún dato no se puede leer con certeza, usa null en ese campo y baja la confianza.`;

  const respuesta = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: promptSistema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imagenBase64,
              },
            },
            {
              type: 'text',
              text: 'Extrae los datos de esta factura en el formato JSON indicado.',
            },
          ],
        },
      ],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  const textoRespuesta = respuesta.data.content
    .filter((bloque) => bloque.type === 'text')
    .map((bloque) => bloque.text)
    .join('');

  // Limpiamos por si el modelo agrega backticks de markdown
  const textoLimpio = textoRespuesta.replace(/```json|```/g, '').trim();

  return JSON.parse(textoLimpio);
}

/**
 * Arma un mensaje corto de confirmación para responder por WhatsApp.
 */
function armarMensajeConfirmacion(datos) {
  if (!datos || datos.confianza === 'baja') {
    return (
      '⚠️ Recibí la factura pero no pude leer todos los datos con seguridad. ' +
      'Por favor revisa manualmente esta factura antes de incluirla en el 606.'
    );
  }

  const partes = [
    '✅ Factura registrada:',
    datos.rnc_proveedor ? `RNC: ${datos.rnc_proveedor}` : null,
    datos.ncf ? `NCF: ${datos.ncf}` : null,
    datos.fecha_comprobante ? `Fecha: ${datos.fecha_comprobante}` : null,
    datos.monto_facturado != null ? `Monto: RD$${datos.monto_facturado}` : null,
    datos.itbis_facturado != null ? `ITBIS: RD$${datos.itbis_facturado}` : null,
  ].filter(Boolean);

  return partes.join('\n');
}

app.post('/webhook', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const numeroDeMedias = parseInt(req.body.NumMedia || '0', 10);

  try {
    if (numeroDeMedias === 0) {
      twiml.message(
        'Hola 👋 Mándame una foto o PDF de la factura y te confirmo los datos que voy a usar para el 606.'
      );
      res.type('text/xml').send(twiml.toString());
      return;
    }

    const mediaUrl = req.body.MediaUrl0;
    const mediaType = req.body.MediaContentType0; // ej: image/jpeg

    console.log(`Descargando media de: ${mediaUrl} (${mediaType})`);
    const bufferImagen = await descargarMediaDeTwilio(mediaUrl);
    const imagenBase64 = bufferImagen.toString('base64');

    const datosExtraidos = await extraerDatosFactura(imagenBase64, mediaType);

    facturasProcesadas.push({
      fecha_recibido: new Date().toISOString(),
      remitente: req.body.From,
      ...datosExtraidos,
    });

    console.log('Factura procesada:', datosExtraidos);

    twiml.message(armarMensajeConfirmacion(datosExtraidos));
    res.type('text/xml').send(twiml.toString());
  } catch (error) {
    console.error('Error procesando la factura:', error.message);
    twiml.message(
      '❌ Hubo un problema procesando la factura. Intenta mandarla de nuevo o revisa que la imagen sea clara.'
    );
    res.type('text/xml').send(twiml.toString());
  }
});

// Endpoint simple para ver todas las facturas procesadas hasta ahora (MVP).
// En producción esto debería tener autenticación.
app.get('/facturas', (req, res) => {
  res.json(facturasProcesadas);
});

app.get('/', (req, res) => {
  res.send('Servidor de facturas por WhatsApp funcionando ✅');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
