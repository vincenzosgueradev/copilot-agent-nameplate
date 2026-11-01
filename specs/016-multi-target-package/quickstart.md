# Quickstart 016

Da fare su un DEV vero, con una solution che ha almeno due agent. Il passo 0 dice come tornare allo stato di partenza.

0. **Stato di partenza**: se hai già usato la funzione, togli le chiavi `releaseTargets` e `targetSelection` dalle impostazioni del tool, oppure usa un'altra connessione.
1. **Lista di partenza.** Apri una solution e vai al passo Targets. Vedi DEV, TEST, UAT, STAGING, PREPROD, PROD, nessuno spuntato. Togli quelli che non usi.
2. **Crea un Target**: scrivi `HOTFIX` e premi invio. Compare in fondo. Prova un nome già presente (anche con altre maiuscole): rifiutato con un messaggio. Prova un nome troppo lungo o con un carattere non ammesso: rifiutato.
3. **Riordina** con i pulsanti su/giù e trascinando. Chiudi il tool e riaprilo: l'ordine, i nomi e il publish di ogni Target ci sono ancora.
4. **Spunta UAT e PROD**, metti PROD su «Force yes». Il selettore sopra la tabella degli agent mostra i nomi `[UAT]` e `[PROD]`. Esclui un agent: resta escluso per **entrambi**.
5. **Un solo giro.** Premi Review. Il dialogo della versione compare **una volta** e nomina la versione, non i Target. Conferma. In DEV la versione sale **di un solo numero**.
6. **Revisione, anteprima, verifica**: per ciascun Target il selettore mostra il suo contenuto. L'anteprima dice quante entry cambiano e che «tutte le altre sono identiche» anche rispetto al primo Target.
7. **Salvataggio.** Se PPTB non ha la scrittura binaria, il tool dice **quanti** salvataggi ti chiederà prima di iniziare. Nella cartella: `…_managed_UAT.zip`, `…_managed_PROD.zip`, `manifest.json`; con le copie extra anche gli unmanaged patchati e i due `source_*.zip`.
8. **Manifest.** Apri `manifest.json`: `manifestVersion: 2`, due voci in `targets`, il confronto di PROD con UAT elenca solo i nomi degli agent e `publishOnImport`.
9. **Storico.** Una sola riga per l'operazione, con entrambi i Target.
10. **Un Target solo.** Rifai con solo UAT: nessun selettore di Target nelle schermate, risultato come prima (cambia solo il formato del manifest).
11. **Giro successivo.** Riapri la stessa solution: UAT e PROD sono già spuntati. Apri un'altra solution: nessuna spunta. Togli PROD dalla lista e riapri la prima: PROD sparito dalle spunte, UAT resta.
12. **Importa** il managed di UAT in UAT e quello di PROD in PROD. Controlla i nomi degli agent in entrambi.
13. **Tema chiaro e scuro**, e una lista di 8+ Target: la schermata resta usabile.

**Non coperto dai test**: l'aspetto reale della lista (allineamenti, il trascinamento nell'host vero, tema chiaro e scuro), il comportamento dello store `settings` di PPTB tra una sessione e l'altra, il numero vero di dialog di salvataggio, e che Dataverse accetti e mostri i nomi dopo l'import.
