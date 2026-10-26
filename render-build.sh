#!/usr/bin/env bash
set -o errexit

# Installer les dépendances Node.js
npm install

# Télécharger et installer le navigateur compatible pour Puppeteer
npx puppeteer browsers install chrome