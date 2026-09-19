// -------------------- Élément HTML --------------------

let chartDiv = document.getElementById("charts");
let chartOverlay = document.getElementById("chart-overlay")

// -------------------- Graphe : une variable --------------------

function displayChartOneVariable(
    xAxisTimeline,
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

        let rows= result["response"][vessel][variableDataset];
        let chartPoints = buildChartPoints(rows, variableDataset, selectedVariable, xAxisTimeline)



        chartDatasets.push({
            label: vessel,
            data: chartPoints,
            borderColor: vesselColors[vessel]
        });
    });


    // Préparer les données pour Chart.js.

    let chartData = {
        datasets: chartDatasets
    };


    // Échelle temporelle : conserver les intervalles réels et les ticks issus des données.
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
                        maxTicksLimit: 10,

                        callback: function(value) {
                            return formatUtcTick(value, this._unit);
                        }
                    }
                },
                y: {
                    position: "left",
                    title: {
                        display: true,
                        text: yAxisTitle
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            return formatUtcTooltip(items[0].parsed.x);
                        }
                    }
                }
            }
        }
    };


    // Construire le canvas et afficher le graphe.

    createChart(chartConfig)


}


// -------------------- Graphe : un navire --------------------

function displayChartOneVessel(
    xAxisTimeline,
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
                maxTicksLimit: 10,

                callback: function(value) {
                    return formatUtcTick(value, this._unit);
                }
            }
        }
    };


    // Un axisID par groupe de variables compatibles ; partager l’axe Y si possible.
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

        let rows = result["response"][selectedVessel][variableDataset]

        let chartPoints = buildChartPoints(rows , variableDataset, variable, xAxisTimeline)


        // Réutiliser l’axe Y du groupe lorsque les variables sont compatibles.
        let variableGroup = getVariableAxisGroup(
            variable,
            variablesMetadata,
            variablesByType
        );


        // Créer l’axe Y seulement si son groupe est nouveau.

        if (!(variableGroup in axisGroup)) {

            axisGroup[variableGroup] = {
                axisID: `y${i}`,
                variables: [variable]
            };

            i += 1;

        } else {

            // Compléter la liste des variables partageant cet axe.

            axisGroup[variableGroup]["variables"].push(variable);
        }


        // Le titre d’axe liste toutes les variables du groupe et leur unité.
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


        // Associer la courbe à l’axe Y de son groupe.

        chartData["datasets"].push({
            label: `${selectedVessel} - ${variable}`,
            data: chartPoints,
            yAxisID: axisGroup[variableGroup]["axisID"]
        });


        // Mettre à jour l’axe Y commun et son titre après chaque nouvelle variable.
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
            scales: variablesScales,
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            return formatUtcTooltip(items[0].parsed.x);
                        }
                    }
                }
            }
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


            // Axes Y : regrouper par dataset + unité, sinon source, sinon nom de variable.
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
function buildChartPoints(rows, variableDataset, selectedVariable, xAxisTimeline){

    let chartPoints = [];
    let j = 0;

    if (variableDataset === "GPS" || variableDataset === "MOTIONS"){
        // GPS/MOTIONS : insérer y=null aux timestamps manquants de la timeline régulière.






        for (let i = 0 ; i < xAxisTimeline.length ; i++) {
            let x =  xAxisTimeline[i];
            let y = null
            if (j < rows.length && xAxisTimeline[i].getTime() === new Date(rows[j].Timestamp + "Z").getTime()){
                console.log(
                    "timeline:", xAxisTimeline[i],
                    "row:", rows[j].Timestamp,
                    "i:", i,
                    "j:", j)
                y = rows[j][selectedVariable];
                j++;
            }
            chartPoints.push({
                    "x": x,
                    "y": y
                });
        };
        console.log(j , chartPoints[j], chartPoints[j+1])
    }else { // Pour les MACS3 on garde les timestamps irréguliers du dataset
        // Construire les points de la courbe de la variable.

        rows.forEach(row => {

            let x = row.Timestamp;
            let y = row[selectedVariable];

            chartPoints.push({
                "x": x,
                "y": y
            });
        });
    }
    return chartPoints
}