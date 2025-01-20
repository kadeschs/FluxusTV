# FluxusTV- Stremio Addon

## 🛠️ Configurazione

### Variabili d'Ambiente Supportate

#### ENABLE_EPG
- Attiva/disattiva le funzionalità EPG
- Valori: 
  - `no` per disattivare 
- Default: attivo
- ATTENZIONE: epg con dimensione estratta maggiore di 5/7 Mbyte potrebbero bloccare i servere se presenti su Render.com

#### PROXY_URL e PROXY_PASSWORD
- Configurazione del MediaFlow Proxy
- Opzionali per la compatibilità con Android e Web

#### FORCE_PROXY
- Forza l'utilizzo del proxy se configurato rimuovendo i canali diretti

#### PORT
- Porta del server
- Default: 10000

## 📦 Installazione

### Deploy su Render.com
1. Collega il repository a Render
2. Configura le variabili d'ambiente opzionali e procedi al deploy oppure
3. Deploy automatico tramite questo pulsante (è necessario avere account anche gratuito su render.com) - Selezionare la branch su plus per attivare la versione plus

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kadeschs/FluxusTV)
