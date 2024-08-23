const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const port = 3000;

// Configuração do multer para receber uploads de arquivos
const upload = multer({ dest: 'uploads/' });

// Função para obter um token de acesso usando a autenticação do Google
async function getAccessToken() {
    const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        keyFile: path.join(__dirname, './document-test-433321-2ea004efb111.json')
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    return accessToken.token;
}

// Rota para processar o upload do PDF
app.post('/process-pdf', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('Nenhum arquivo foi enviado.');
        }

        // Lê o conteúdo do arquivo PDF
        const filePath = path.join(__dirname, req.file.path);
        const fileContent = fs.readFileSync(filePath).toString('base64');

        // Obtém o token de acesso
        const accessToken = await getAccessToken();

        // Configura a requisição para o Google Document AI
        const response = await axios.post(
            `https://us-documentai.googleapis.com/v1/projects/${process.env.PROJECT_ID}/locations/${process.env.LOCATION}/processors/${process.env.PROCESSOR_ID}:process`,
            {
                rawDocument: {
                    content: fileContent,
                    mimeType: 'application/pdf',
                },
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                timeout: 120000,  // Timeout de 2 minutos
            }
        );

        // Deleta o arquivo após o processamento
        fs.unlinkSync(filePath);

        // Retorna a resposta da API para o cliente
        res.json(response.data);
    } catch (error) {
        console.error('Erro ao processar o documento:', error.message);
        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else if (error.request) {
            res.status(500).send('Erro de conexão com a API do Google Document AI.');
        } else {
            res.status(500).send('Erro ao processar o documento.');
        }
    }
});

// Inicializa o servidor
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
