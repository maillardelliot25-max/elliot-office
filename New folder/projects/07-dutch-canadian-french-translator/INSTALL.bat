@echo off
title Dutch-Canadian French Translator
if not exist node_modules call npm install
start http://localhost:5300
npm start
