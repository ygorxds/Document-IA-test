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

// Função auxiliar para determinar o MIME type do arquivo
function getMimeType(file) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return null;
}

// Função para processar o texto extraído
function processExtractedText(text) {
    const result = {
        contrato: {},
        rg: [],
        cnh: [],
        outrasIdentidades: [],
        erro: null
    };

    try {
        // Separando as partes do contrato
        const contratoRegex = /CONTRATO DE EMPRÉSTIMO COM GARANTIA FIDEJUSSÓRIA([\s\S]*?)ASSINATURA DO/;
        const contratoMatch = text.match(contratoRegex);
        if (contratoMatch) {
            result.contrato = {
                titulo: "Contrato de Empréstimo",
                corpo: contratoMatch[1].trim()
            };
        }

        // Extraindo RGs
        const rgRegex = /REGISTRO GERAL (\d{1,3}\.\d{3}\.\d{3})/g;
        let rgMatch;
        while ((rgMatch = rgRegex.exec(text)) !== null) {
            result.rg.push({
                numero: rgMatch[1]
            });
        }

        // Extraindo CNHs
        const cnhRegex = /CARTEIRA DE IDENTIDADE([\s\S]*?)CPF/g;
        let cnhMatch;
        while ((cnhMatch = cnhRegex.exec(text)) !== null) {
            result.cnh.push({
                informacoes: cnhMatch[1].trim()
            });
        }

        // Extraindo outras identidades
        const outrasIdentidadesRegex = /Identidade (\d)[\s\S]*?CPF/g;
        let identidadeMatch;
        while ((identidadeMatch = outrasIdentidadesRegex.exec(text)) !== null) {
            result.outrasIdentidades.push({
                informacoes: identidadeMatch[0].trim()
            });
        }

    } catch (err) {
        console.error("Erro ao processar o texto extraído:", err);
        result.erro = err.message;
    }

    return result;
}

// Rota para processar o upload do documento (PDF ou imagem)
app.post('/process-document', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('Nenhum arquivo foi enviado.');
        }

        // Determina o tipo MIME com base no arquivo enviado
        const mimeType = getMimeType(req.file.originalname);
        if (!mimeType) {
            return res.status(400).send('Tipo de arquivo não suportado.');
        }

        // Lê o conteúdo do arquivo
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
                    mimeType: mimeType,
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

        // Processa o texto extraído
        const extractedText = response.data.document.text;
        const processedData = processExtractedText(extractedText);

        // Retorna o objeto processado ao cliente
        res.json(processedData);

        // Aqui você poderia salvar `processedData` no banco de dados

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
