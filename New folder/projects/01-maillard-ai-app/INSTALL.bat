@echo off
title Maillard AI
if not exist node_modules call npm install
start http://localhost:5000
npm start
