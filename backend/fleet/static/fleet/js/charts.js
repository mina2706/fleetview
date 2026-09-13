// -------------------- Élément HTML --------------------

let chartDiv = document.getElementById("charts");


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
    let chartDataset = [];

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

        chartDataset.push({
            label: vessel,
            data: chartPoints,
            borderColor: vesselColors[vessel]
        });
    });


    // Données transmises à Chart.js.
    let chartData = {
        datasets: chartDataset
    };


    // Configuration du graphe.
    // L'axe X utilise les timestamps réels afin de conserver
    // les écarts temporels entre les mesures.
    let chartConfig = {
        type: "line",
        data: chartData,
        options: {
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


    // Remplacer le graphe précédent par le résultat de la nouvelle recherche.
    chartDiv.replaceChildren();

    let chartCanvas = document.createElement("canvas");
    chartDiv.appendChild(chartCanvas);

    new Chart(chartCanvas, chartConfig);
}