// -------------------- Éléments HTML --------------------

let playButton = document.getElementById("replay-play");
let pauseButton = document.getElementById("replay-pause");


// -------------------- Construction de la timeline --------------------

/*
 * Construire la timeline utilisée par le replay à partir
 * de la période sélectionnée lors du dernier Find.
 *
 * La timeline couvre chaque journée complète :
 * de 00:00 jusqu'à 23:45, avec un pas fixe de 15 minutes.
 *
 * Elle est volontairement indépendante des timestamps réellement
 * disponibles dans les datasets.
 *
 * Une absence de donnée à un instant de la timeline doit donc rester
 * visible comme une absence de donnée et ne modifie pas la timeline.
 */
function createReplayTimeline(selectedStartDate, selectedEndDate) {

    let startDate = new Date(selectedStartDate + "T00:00");
    let endDate = new Date(selectedEndDate + "T00:00");

    // Ajouter un jour afin que la dernière journée sélectionnée
    // soit parcourue entièrement jusqu'à 23:45.
    endDate.setDate(endDate.getDate() + 1);

    let nextTime = startDate.getTime();
    let step = 15 * 60 * 1000;
    let replayTimeline = [];

    while (nextTime < endDate.getTime()) {
        replayTimeline.push(new Date(nextTime));
        nextTime = nextTime + step;
    }

    return replayTimeline;
}


// -------------------- État d'un navire à un instant --------------------

/*
 * Reconstituer l'état d'un navire pour un instant donné du replay.
 *
 * L'objet retourné contient :
 *
 * {
 *     position: [Latitude, Longitude] ou null,
 *     values: {
 *         variable: valeur ou null
 *     },
 *     macs3Timestamp: timestamp du dernier état MACS3 utilisé ou null
 * }
 *
 * Les datasets continus et MACS3 n'ont pas la même logique temporelle :
 *
 * - GPS et autres variables continues :
 *   une valeur n'est utilisée que si son timestamp correspond exactement
 *   à l'instant courant du replay. Sinon la valeur reste null.
 *
 * - MACS3 :
 *   les données représentent des snapshots d'état.
 *   Le dernier snapshot dont le timestamp est inférieur ou égal
 *   à l'instant courant reste donc valable jusqu'au snapshot suivant.
 */
function getVesselDataAtTime(
    curentTime,
    vessel,
    result,
    selectedVariables,
    variablesByType
) {
    let curentVesselState = {};


    // -------------------- Position GPS --------------------

    // Rechercher uniquement une position possédant exactement
    // le même timestamp que l'instant courant du replay.
    // La dernière position connue n'est pas reportée en cas de trou GPS.
    let gpsRows = result["response"][vessel]["GPS"];
    let curentPosition = null;

    let curentGpsRow = gpsRows.find(
        gpsRow =>
            new Date(gpsRow.Timestamp).getTime() === curentTime.getTime()
    );

    if (curentGpsRow !== undefined) {
        curentPosition = [
            curentGpsRow.Latitude,
            curentGpsRow.Longitude
        ];
    }


    // -------------------- Valeurs des variables --------------------

    let varibalesValues = {};
    let macs3Timestamp = null;

    selectedVariables.forEach(variable => {

        let curentValue = null;

        /*
         * Retrouver le dataset auquel appartient la variable sélectionnée
         * à partir de la structure variablesByType chargée dans app.js.
         */
        Object.keys(variablesByType).forEach(type => {

            if (variablesByType[type].includes(variable)) {

                /*
                 * Pour les variables hors MACS3, rechercher uniquement
                 * une mesure possédant exactement le timestamp courant.
                 *
                 * Si aucune mesure n'existe à cet instant,
                 * la valeur reste null.
                 */
                let variableRows = result["response"][vessel][type];

                let curentVariableRow = variableRows.find(
                    variableRow =>
                        new Date(variableRow.Timestamp).getTime()
                        === curentTime.getTime()
                );

                if (curentVariableRow !== undefined) {
                    curentValue = curentVariableRow[variable];
                }


                // -------------------- Cas particulier MACS3 --------------------

                /*
                 * MACS3 décrit un état du navire sous forme de snapshots.
                 *
                 * Contrairement aux variables continues, le snapshot
                 * reste valable jusqu'à l'arrivée du suivant.
                 *
                 * replay_context contient donc l'historique MACS3 complet
                 * du navire afin de pouvoir retrouver le dernier état connu,
                 * y compris lorsqu'il est antérieur au début de la période
                 * actuellement affichée.
                 */
                if (type === "MACS3") {

                    let variableRows = result.replay_context[vessel];
                    let curentVariableRow;

                    /*
                     * Parcourir les snapshots dans l'ordre fourni et conserver
                     * le dernier dont le timestamp est inférieur ou égal
                     * à l'instant courant.
                     */
                    variableRows.forEach(variableRow => {

                        if (
                            new Date(variableRow.Timestamp).getTime()
                            <= curentTime.getTime()
                        ) {
                            curentVariableRow = variableRow;
                        }
                    });

                    if (curentVariableRow !== undefined) {
                        curentValue = curentVariableRow[variable];

                        /*
                         * Conserver également le timestamp du snapshot utilisé.
                         * Il permettra d'indiquer dans l'interface la dernière
                         * mise à jour MACS3 associée à l'état affiché.
                         */
                        macs3Timestamp = curentVariableRow.Timestamp;
                    }
                }
            }
        });

        varibalesValues[variable] = curentValue;
    });


    // -------------------- État final du navire --------------------

    curentVesselState.position = curentPosition;
    curentVesselState.values = varibalesValues;
    curentVesselState.macs3Timestamp = macs3Timestamp;

    return curentVesselState;
}


// -------------------- Contrôle du replay --------------------

/*
 * i représente l'index de l'instant actuellement parcouru
 * dans replayTimeline.
 *
 * Il est remis à zéro dans app.js lorsqu'un nouveau replay est créé.
 */
let i = 0;

/*
 * Conserver l'identifiant du setInterval actif.
 *
 * null signifie qu'aucun replay n'est actuellement en cours.
 * Cette valeur permet :
 * - d'éviter de lancer plusieurs intervalles avec plusieurs clics sur Play ;
 * - de reprendre le replay après une Pause.
 */
let replayInterval = null;


// -------------------- Play --------------------

playButton.addEventListener("click", () => {

    // Ne démarrer un intervalle que si aucun replay n'est déjà actif.
    if (replayInterval === null) {

        replayInterval = setInterval(() => {

            let curentTime = replayTimeline[i];

            /*
             * Tant qu'un instant existe dans la timeline,
             * reconstituer l'état de chaque navire sélectionné.
             */
            if (curentTime !== undefined) {

                selectedVessels.forEach(vessel => {

                    let curentVesselState = getVesselDataAtTime(
                        curentTime,
                        vessel,
                        result,
                        selectedVariables,
                        variablesByType
                    );

                    /*
                     * Une position GPS n'est affichée que si Latitude
                     * et Longitude sont réellement disponibles.
                     *
                     * En cas de trou GPS, le marqueur est masqué plutôt que
                     * laissé à sa position précédente : conserver l'ancienne
                     * position ferait croire qu'une position est connue
                     * alors qu'aucune donnée GPS n'existe à cet instant.
                     */
                    if (
                        curentVesselState.position !== null
                        && curentVesselState.position[0] !== null
                        && curentVesselState.position[1] !== null
                    ) {
                        // Réafficher le marqueur s'il avait été masqué
                        // pendant un instant sans position GPS.
                        vesselsMarkers[vessel].setOpacity(1);

                        // Déplacer le marqueur vers la position correspondant
                        // à l'instant courant du replay.
                        vesselsMarkers[vessel].setLatLng(
                            curentVesselState.position
                        );

                    } else {

                        // Masquer le marqueur lorsqu'aucune position GPS
                        // valide n'est disponible à cet instant.
                        vesselsMarkers[vessel].setOpacity(0);
                    }
                });

            } else {

                /*
                 * Aucun nouvel instant n'existe :
                 * la fin de la timeline a été atteinte.
                 *
                 * Arrêter alors l'intervalle et remettre replayInterval
                 * à null afin qu'un nouveau Play puisse être lancé ensuite.
                 */
                clearInterval(replayInterval);
                replayInterval = null;
            }

            // Passer à l'instant suivant de la timeline.
            i++;

        }, 1000);
    }
});


// -------------------- Pause --------------------

pauseButton.addEventListener("click", () => {

    /*
     * Arrêter l'intervalle sans modifier i.
     *
     * Le prochain clic sur Play reprendra donc le replay
     * à partir de l'instant où il a été interrompu.
     */
    clearInterval(replayInterval);
    replayInterval = null;
});