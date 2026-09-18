// -------------------- Élément HTML --------------------

let chartDiv = document.getElementById("charts");
let chartOverlay = document.getElementById("chart-overlay")


// -------------------- Graphe : une variable --------------------

function displayChartOneVariable(
    result,
    selectedVessels,
    selectedVariable,
    variablesMetadata,
    variablesByType
) {

    // Retrouver le dataset auquel appartient la variable sélectionnée.
    let variableDataset;

    Object.keys(variablesByType).forEach(type => {
        if (variablesByType[type].includes(selectedVariable)) {
            variableDataset = type;
        }
    });


    // Construire le titre de l'axe Y avec l'unité lorsqu'elle existe.
    let variableUnits =
        variablesMetadata[variableDataset][selectedVariable]["unit"];

    let yAxisTitle;

    if (variableUnits.length !== 0) {
        yAxisTitle = `${selectedVariable} (${variableUnits[0]})`;
    } else {
        yAxisTitle = selectedVariable;
    }


    // Construire une courbe par navire pour la variable sélectionnée.
    let chartDatasets = [];

    selectedVessels.forEach(vessel => {

        let chartPoints = [];

        result["response"][vessel][variableDataset].forEach(row => {

            let x = row.Timestamp;
            let y = row[selectedVariable];

            chartPoints.push({
                "x": x,
                "y": y
            });
        });

        chartDatasets.push({
            label: vessel,
            data: chartPoints,
            borderColor: vesselColors[vessel]
        });
    });


    // Construire les données du graphe au format attendu
    // par la bibliothèque Chart.js.
    let chartData = {
        datasets: chartDatasets
    };


    /*
     * L'axe X utilise une échelle temporelle.
     *
     * Chaque point possède son propre Timestamp :
     * Chart.js conserve donc les écarts temporels réels
     * entre les mesures au lieu de répartir les points
     * uniformément sur l'axe.
     *
     * Les graduations affichées sont prises parmi les
     * timestamps réellement présents dans les données.
     */
    let chartConfig = {
        type: "line",
        data: chartData,
        options: {
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "time",
                    ticks: {
                        source: "data",
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                },
                y: {
                    position: "left",
                    title: {
                        display: true,
                        text: yAxisTitle
                    }
                }
            }
        }
    };


    // Créer un canvas pour ce graphe puis demander
    // à Chart.js d'y effectuer le rendu.
    createChart(chartConfig)

    
}


// -------------------- Graphe : un navire --------------------

function displayChartOneVessel(
    result,
    selectedVessel,
    selectedVariables,
    variablesMetadata,
    variablesByType
) {

    let chartData = {
        datasets: []
    };


    // L'axe temporel X est commun à toutes les variables du navire.
    let variablesScales = {
        x: {
            type: "time",
            ticks: {
                source: "data",
                autoSkip: true,
                maxTicksLimit: 10
            }
        }
    };


    /*
     * axisGroup mémorise l'association entre :
     *
     * - un groupe de variables compatibles ;
     * - l'identifiant de l'axe Y utilisé par Chart.js ;
     * - les variables déjà associées à cet axe.
     *
     * Exemple :
     *
     * "GPS-deg" -> {
     *     axisID: "y0",
     *     variables: ["Course", "Heading"]
     * }
     *
     * Course et Heading peuvent ainsi utiliser le même axe Y,
     * au lieu de créer systématiquement un nouvel axe
     * pour chaque variable.
     */
    let axisGroup = {};
    let i = 0;


    selectedVariables.forEach(variable => {

        // Retrouver le dataset auquel appartient la variable sélectionnée.
        let variableDataset;

        Object.keys(variablesByType).forEach(type => {
            if (variablesByType[type].includes(variable)) {
                variableDataset = type;
            }
        });


        // Construire les points de la courbe de la variable.
        let chartPoints = [];

        result["response"][selectedVessel][variableDataset].forEach(row => {

            let x = row.Timestamp;
            let y = row[variable];

            chartPoints.push({
                "x": x,
                "y": y
            });
        });


        /*
         * Déterminer le groupe d'axe de la variable.
         *
         * Les variables partageant le même groupe réutilisent
         * le même axe Y.
         */
        let variableGroup = getVariableAxisGroup(
            variable,
            variablesMetadata,
            variablesByType
        );


        // Créer un nouvel axe uniquement si aucun axe
        // n'existe encore pour ce groupe.
        if (!(variableGroup in axisGroup)) {

            axisGroup[variableGroup] = {
                axisID: `y${i}`,
                variables: [variable]
            };

            i += 1;

        } else {

            // Le groupe existe déjà :
            // ajouter la variable à la liste associée au même axe.
            axisGroup[variableGroup]["variables"].push(variable);
        }


        /*
         * Le titre de l'axe reprend les variables qui partagent
         * réellement cet axe.
         *
         * Exemple :
         *
         * Course / Heading (deg)
         */
        let yAxisText =
            axisGroup[variableGroup]["variables"].join(" / ");

        let variableUnits =
            variablesMetadata[variableDataset][variable]["unit"];

        let yAxisTitle;

        if (variableUnits.length !== 0) {
            yAxisTitle = `${yAxisText} (${variableUnits[0]})`;
        } else {
            yAxisTitle = yAxisText;
        }


        // Ajouter la courbe et l'associer explicitement
        // à l'axe Y de son groupe.
        chartData["datasets"].push({
            label: `${selectedVessel} - ${variable}`,
            data: chartPoints,
            yAxisID: axisGroup[variableGroup]["axisID"]
        });


        /*
         * Créer ou mettre à jour la configuration de l'axe.
         *
         * Lorsqu'une nouvelle variable rejoint un groupe existant,
         * le même axisID est réutilisé et son titre est mis à jour
         * avec l'ensemble des variables du groupe.
         */
        variablesScales[axisGroup[variableGroup]["axisID"]] = {
            position: "left",
            title: {
                display: true,
                text: yAxisTitle
            }
        };
    });


    // Construire la configuration finale du graphe.
    let chartConfig = {
        type: "line",
        data: chartData,
        options: {
            maintainAspectRatio: false,
            scales: variablesScales
        }
    };


    // Créer un canvas pour ce navire puis effectuer le rendu.
    createChart(chartConfig)
}


// -------------------- Regroupement des axes --------------------

function getVariableAxisGroup(
    variable,
    variablesMetadata,
    variablesByType
) {

    let groupName;


    Object.keys(variablesByType).forEach(type => {

        if (variablesByType[type].includes(variable)) {

            let variableUnits =
                variablesMetadata[type][variable]["unit"];

            let variableSources =
                variablesMetadata[type][variable]["source"];


            /*
             * Règle de regroupement retenue pour le prototype :
             *
             * 1. dataset + unité lorsque l'unité existe ;
             * 2. dataset + source lorsque la variable n'a pas d'unité ;
             * 3. dataset + nom de variable en dernier recours.
             *
             * Le dataset reste dans la clé afin de ne pas regrouper
             * automatiquement des grandeurs provenant de familles
             * de données différentes uniquement parce qu'elles
             * utilisent la même unité.
             */
            if (variableUnits.length !== 0) {

                groupName = `${type}-${variableUnits[0]}`;

            } else if (variableSources.length !== 0) {

                groupName = `${type}-${variableSources[0]}`;

            } else {

                groupName = `${type}-${variable}`;
            }
        }
    });


    return groupName;
}

function createChart(chartConfig) {

    let chartContainer = document.createElement("div");
    chartContainer.classList.add("chart-container");

    let chartCanvas = document.createElement("canvas");

    let closeButton = document.createElement("button");
    closeButton.classList.add("chart-close");
    closeButton.textContent = "×";

    chartContainer.appendChild(chartCanvas);
    chartContainer.appendChild(closeButton);

    chartDiv.appendChild(chartContainer);

    new Chart(chartCanvas, chartConfig);


    // Agrandir le graphe au clic.
    chartContainer.addEventListener("click", () => {
        chartContainer.classList.add("expanded");
        chartOverlay.style.display = "block";
    });


    // Fermer le graphe agrandi.
    closeButton.addEventListener("click", event => {
        event.stopPropagation();

        chartContainer.classList.remove("expanded");
        chartOverlay.style.display = "none";
    });
}