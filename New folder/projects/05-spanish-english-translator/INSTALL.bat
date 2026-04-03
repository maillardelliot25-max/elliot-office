@echo off
title Spanish-English Translator
if not exist node_modules call npm install
start http://localhost:5100
npm start
