# logs/

Verificatie-output van afgeronde fases. Eén bestand per fase, genoemd
`fase-<n>-<korte-naam>.md`.

Wat hier hoort: de **echte** output van commando's die de afronding van een fase
bewijzen — testresultaten, curl-responses, build-output, hashes. Niet de
samenvatting ervan; de ruwe regels.

Waarom apart van de changelog: de changelog vertelt *wat* er veranderde in twee
zinnen. Deze map bewaart het *bewijs*, dat te lang is voor een changelog-regel
maar waardevol als je later twijfelt of iets echt gecontroleerd is.

Wat hier niet hoort: applicatielogboeken (die staan in PM2 op de VPS) en
scratchpad-experimenten.
