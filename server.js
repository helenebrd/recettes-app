const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL requise" });

    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const extractedData = await page.evaluate(() => {
            const currentUrl = window.location.href;
            let text = document.body.innerText;
            
            const titleMeta = document.querySelector('meta[property="og:title"]')?.content || document.querySelector('title')?.innerText || "";
            const descMeta = document.querySelector('meta[property="og:description"]')?.content || "";
            let image = document.querySelector('meta[property="og:image"]')?.content;
            
            if (currentUrl.includes('tiktok.com') || currentUrl.includes('instagram.com')) {
                text = `[DONNÉES VIDÉO RÉSEAU SOCIAL]\nTitre: ${titleMeta}\nDescription/Légende: ${descMeta}\nTexte visible: ${text.substring(0, 1000)}`;
            } else {
                text = text.substring(0, 15000);
            }

            if (!image) {
                const imgElement = document.querySelector('article img, main img');
                image = imgElement ? imgElement.src : null;
            }
            return { text, image }; 
        });

        await browser.close();

        const promptSystem = `Tu es un expert culinaire. Extrais la recette de cuisine du texte et/ou de la légende vidéo fournis ci-dessous. 
Même si le format est désordonné (hashtags, émojis), déduis-en les ingrédients et les étapes logiques.
Renvoie UNIQUEMENT un objet JSON valide avec cette structure stricte :
{
  "title": "Nom de la recette",
  "ingredients": ["ingrédient 1", "ingrédient 2"],
  "steps": ["étape 1", "étape 2"],
  "image": "${extractedData.image || 'null'}"
}

CONTENU À ANALYSER :
${extractedData.text}`;

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const result = await model.generateContent(promptSystem);
        const recipeJSON = JSON.parse(result.response.text());
        
        if (!recipeJSON.image || recipeJSON.image === 'null') {
            recipeJSON.image = extractedData.image;
        }

        res.json(recipeJSON);

    } catch (error) {
        console.error("Erreur serveur :", error);
        if (browser) await browser.close();
        res.status(500).json({ error: "Erreur lors de l'extraction de la recette" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
