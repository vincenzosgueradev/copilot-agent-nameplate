# Ricerca 017

- **Dov'è la produzione**: nel tool la produzione è il target con il nome vuoto (suffisso tolto), come dice il testo già in pagina. Per questo la casella sta lì e non sui target con un nome.
- **Casella o nome riservato**: riconoscere `PROD` dal nome si rompe appena lo si rinomina (LIVE, PRODUZIONE) e non copre il target senza nome, che è proprio quello che oggi avvisa. La casella è esplicita e vale per qualsiasi alias.
- **Campo opzionale**: le liste già salvate non hanno il campo; `production !== true` vale falso, quindi nessuna migrazione.
- **Nessuna fonte esterna**: nessun valore Dataverse coinvolto.
