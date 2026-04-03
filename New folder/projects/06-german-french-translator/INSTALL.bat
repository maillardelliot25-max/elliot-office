@echo off
title German-French Translator
if not exist node_modules call npm install
start http://localhost:5200
npm start
