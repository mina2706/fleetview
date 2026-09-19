// -------------------- Éléments HTML --------------------

let playButton = document.getElementById("replay-play");
let pauseButton = document.getElementById("replay-pause");

let replayTableHeader = document.getElementById("replay-table-header");
let replayTableBody = document.getElementById("replay-table-body")
let replayCurentTime = document.getElementById("replay-current-time")
const initialReplayTimeText = replayCurentTime.textContent;

let speedUpButton = document.getElementById("replay-speed-up")
let speedDownButton = document.getElementById("replay-speed-down")
let speedValue = document.getElementById("replay-speed-value")



let replayDelay = 1000
let replaySpeeds = [0.5, 1, 2, 4, 8];
let replaySpeedIndex = 1;

const initialReplayDelay = replayDelay
const initialReplaySpeedIndex = replaySpeedIndex;
const initialSpeedText = speedValue.textContent;

// -------------------- État d'un navire à un instant --------------------

// GPS/MOTIONS : timestamp exact ; MACS3 : dernier snapshot connu à cet instant.
function getVesselDataAtTime(
    curentTime,
    vessel,
    result,
    selectedVariables,
    variablesByType
) {
    let curentVesselState = {};


    // -------------------- Position GPS --------------------

    // GPS : égalité temporelle stricte, pas de report de position manquante.


    let gpsRows = result["response"][vessel]["GPS"];
    let curentPosition = null;

    let curentGpsRow = gpsRows.find(
        gpsRow =>
            new Date(gpsRow.Timestamp + "Z").getTime() === curentTime.getTime()
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

        // Identifier le dataset de la variable sélectionnée.
        Object.keys(variablesByType).forEach(type => {

            if (variablesByType[type].includes(variable)) {

                // Hors MACS3 : ne conserver que la mesure au timestamp exact.
                let variableRows = result["response"][vessel][type];

                let curentVariableRow = variableRows.find(
                    variableRow =>
                        new Date(variableRow.Timestamp + "Z").getTime()
                        === curentTime.getTime()
                );

                if (curentVariableRow !== undefined) {
                    curentValue = curentVariableRow[variable];
                }


                // -------------------- Cas particulier MACS3 --------------------

                // L’historique MACS3 complet permet de retrouver un état antérieur à la période.
                if (type === "MACS3") {

                    let variableRows = result.replay_context[vessel];
                    let curentVariableRow;

                    // Conserver le dernier snapshot MACS3 dont la date est <= à l’instant courant.
                    variableRows.forEach(variableRow => {

                        if (
                            new Date(variableRow.Timestamp + "Z").getTime()
                            <= curentTime.getTime()
                        ) {
                            curentVariableRow = variableRow;
                        }
                    });

                    if (curentVariableRow !== undefined) {
                        curentValue = curentVariableRow[variable];

                        // Exposer la date du dernier snapshot MACS3 utilisé.
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

// Index du pas courant ; remis à zéro lors d’un nouveau Replay.
let i = 0;

// null indique qu’aucun intervalle n’est actif : Play évite les doublons et Pause reprend.
let replayInterval = null;


// -------------------- Play --------------------

playButton.addEventListener("click", () => {

    // Ne démarrer un intervalle que si aucun replay n'est déjà actif.
    if (replayInterval === null) {

        replayInterval = setInterval(runReplayTick,  replayDelay);
    }
});


// -------------------- Pause --------------------

pauseButton.addEventListener("click", () => {

    // Pause arrête le timer sans avancer l’index courant.
    clearInterval(replayInterval);
    replayInterval = null;
});

// tableau de replay

function buildReplayTableHeader(selectedVariables, variablesByType) {

    replayTableHeader.replaceChildren();

    // colonnes fixes
    let fixedColumns = ["Vessel" , "Latitude" , "Longitude"]

    fixedColumns.forEach(column => {
        let th = document.createElement("th")
        th.textContent = column
        replayTableHeader.appendChild(th)
    })

    // variables sélectionnées
    selectedVariables.forEach(variable => {
        let th = document.createElement("th")
        th.textContent = variable
        replayTableHeader.appendChild(th)
    })

    // éventuellement "MACS3 last update" si une variable de ce dataset est selectionnée
    let hasMacs3Variable = selectedVariables.some(variable =>variablesByType["MACS3"].includes(variable));
    if (hasMacs3Variable){
        let th = document.createElement("th");
        th.textContent = "MACS3 Last update";
        replayTableHeader.appendChild(th);
    }

}

function updateReplayTable(selectedVessels, curentTime, result, selectedVariables, variablesByType){
    replayTableBody.replaceChildren()
    let hasMacs3Variable = selectedVariables.some(variable =>variablesByType["MACS3"].includes(variable));
    selectedVessels.forEach(vessel => {
        // ajouter l'IMO du navire courant au tableau
        let row = document.createElement("tr")
        let firstColumn = document.createElement("td")
        firstColumn.textContent = vessel
        row.appendChild(firstColumn)

        let vesselData = getVesselDataAtTime(curentTime, vessel, result, selectedVariables, variablesByType)

        // ajouter la position au tableau au timestamp courant
        let latitude = document.createElement("td")
        let longitude = document.createElement("td")
        if (vesselData.position !== null && vesselData.position[0] !== null && vesselData.position[1]  !== null ){
            latitude.textContent = vesselData.position[0]
            longitude.textContent = vesselData.position[1]
        }else{
            latitude.textContent = " - "
            longitude.textContent = " - "
        }
        row.appendChild(latitude)
        row.appendChild(longitude)

        // parcourir les variables selectionnées et ajouter leurs valeurs au timestamp courant
        selectedVariables.forEach(variable => {
            let cell = document.createElement("td")
            let value = vesselData.values[variable]
            if (value !== null && value !== undefined){
                cell.textContent = value
            }else{
                cell.textContent = " - "
            }
            row.appendChild(cell)
        })


        // on ajoute le timestamp du MACS3 si une variable de ce dataset est selectionnée
        if (hasMacs3Variable){
            let macs3Cell = document.createElement("td");
            if (vesselData.macs3Timestamp !== null && vesselData.macs3Timestamp !== undefined) {
                macs3Cell.textContent = vesselData.macs3Timestamp;
            }else{
                macs3Cell.textContent = " - ";
            }

            row.appendChild(macs3Cell);
        }

        replayTableBody.appendChild(row);
    })
}

speedUpButton.addEventListener("click", () => {

    if (replaySpeedIndex < replaySpeeds.length - 1) {

        let wasPlaying = replayInterval !== null;

        replaySpeedIndex++;
        replayDelay = 1000 / replaySpeeds[replaySpeedIndex];
        speedValue.textContent = `${replaySpeeds[replaySpeedIndex]}x`;
         // on ne peut changer la vitesse sauf si y a déja un replay en cours
        if (wasPlaying) {
            clearInterval(replayInterval);
            // recréer l'interavle avec une nouvelle vitesse au même i
            replayInterval = setInterval(runReplayTick, replayDelay);
        }
    }
});

speedDownButton.addEventListener("click", () => {
    if (replaySpeedIndex > 0 ) {

        let wasPlaying = replayInterval !== null;

        replaySpeedIndex--;
        replayDelay = 1000 / replaySpeeds[replaySpeedIndex]
        speedValue.textContent = `${replaySpeeds[replaySpeedIndex]}x`
        // on ne peut changer la vitesse sauf si y a déja un replay en cours
        if (wasPlaying) {
            clearInterval(replayInterval);
            // recréer l'interavle avec une nouvelle vitesse au même i
            replayInterval = setInterval(runReplayTick, replayDelay);
        }
    }
})

function runReplayTick() {

    let curentTime = replayTimeline[i];

    // Reconstituer l’état uniquement tant qu’un instant existe.
    if (curentTime !== undefined) {
        replayCurentTime.textContent = `Current time: ${curentTime.toLocaleString("fr-FR", { timeZone: "UTC" })}`;
        updateReplayTable(selectedVessels, curentTime, result , selectedVariables, variablesByType)
        selectedVessels.forEach(vessel => {

            let curentVesselState = getVesselDataAtTime(
                curentTime,
                vessel,
                result,
                selectedVariables,
                variablesByType
            );




            // Sans GPS valide à cet instant, masquer le marqueur plutôt que le figer.
            if (
                curentVesselState.position !== null
                && curentVesselState.position[0] !== null
                && curentVesselState.position[1] !== null
            ) {
                // Réafficher le marqueur après un trou GPS.

                vesselsMarkers[vessel].setOpacity(1);

                // Déplacer le marqueur à la position du tick courant.

                vesselsMarkers[vessel].setLatLng(
                    curentVesselState.position
                );

            } else {

                // Masquer le marqueur sans position GPS valide.

                vesselsMarkers[vessel].setOpacity(0);
            }
        });

    } else {

        // En fin de timeline, arrêter le timer et rendre Play à nouveau disponible.
        clearInterval(replayInterval);
        replayInterval = null;
    }

    // Passer à l'instant suivant de la timeline.
    i++;

}