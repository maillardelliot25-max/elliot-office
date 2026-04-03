@echo off
title SaaS Metrics Visualizer
echo Starting SaaS Metrics Visualizer...
start http://localhost:8000
python -m http.server 8000
