// -------------------- Éléments HTML --------------------

let findButton = document.getElementById("find");

let vesselOptions = document.getElementById("vessel-options");
let vesselDropdown = document.getElementById("vessels-dropdown");

let startDateInput = document.getElementById("start-date");
let endDateInput = document.getElementById("end-date");

let variableOptions = document.getElementById("variable-options");
let variablesDropdown = document.getElementById("variables-dropdown");

let messagesDiv = document.getElementById("messages");

let colorVariableSelect = document.getElementById("color-variable");
let referenceInput = document.getElementById("reference-value");
let toleranceInput = document.getElementById("tolerance-value");

let chartViewSelect = document.getElementById("chart-view");

let replayButton = document.getElementById("replay");
let exitReplayButton = document.getElementById("replay-exit")


// -------------------- Chargement des sélecteurs --------------------

// Alimenter le sélecteur de navires avec les données réelles.
async function loadVessels() {
    let vesselsResponse = await fetch("/api/vessels/");
    let vesselsResult = await vesselsResponse.json();

    vesselsResult.vessels.forEach(vessel => {
        let vesselOption = document.createElement("div");

        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = vessel;
        checkbox.id = `vessel-${vessel}`;

        let label = document.createElement("label");
        label.textContent = vessel;
        label.htmlFor = checkbox.id;

        vesselOption.appendChild(checkbox);
        vesselOption.appendChild(label);

        vesselOptions.appendChild(vesselOption);
    });
}


// Conserver les variables regroupées par dataset.
// Cette structure permet ensuite de retrouver le dataset
// auquel appartient une variable sélectionnée.
let variablesByType = {};


// Conserver les métadonnées complètes des variables.
// Elles sont notamment utilisées par les graphes pour récupérer
// les unités, les sources et déterminer le regroupement des axes Y.
let variablesMetadata = {};


// Alimenter le sélecteur de variables avec les données réelles.
async function loadVariables() {
    let variablesResponse = await fetch("/api/variables/");
    let variablesResult = await variablesResponse.json();

    variablesMetadata = variablesResult["variables"];

    let datasetTypes = Object.keys(variablesResult["variables"]);

    datasetTypes.forEach(type => {
        variablesByType[type] = Object.keys(
            variablesResult["variables"][type]
        );

        // Créer un groupe pour chaque dataset : GPS, MOTIONS, MACS3...
        let variableType = document.createElement("div");

        let typeLabel = document.createElement("div");
        typeLabel.textContent = type;

        variableType.appendChild(typeLabel);

        variablesByType[type].forEach(variable => {
            if (
                variable !== "Timestamp" &&
                variable !== "Latitude" &&
                variable !== "Longitude"
            ) {
                let variableOption = document.createElement("div");

                let checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = variable;
                checkbox.id = `variable-${variable}`;

                let label = document.createElement("label");
                label.textContent = variable;
                label.htmlFor = checkbox.id;

                variableOption.appendChild(checkbox);
                variableOption.appendChild(label);

                variableType.appendChild(variableOption);
            }
        });

        variableOptions.appendChild(variableType);
    });
}


document.addEventListener("DOMContentLoaded", () => {
    loadVessels();
    loadVariables();
});


// -------------------- Recherche --------------------

/*
 * Les informations de la recherche sont déclarées en dehors
 * du gestionnaire du bouton Find.
 *
 * Elles doivent rester accessibles après la requête afin que replay.js
 * puisse réutiliser les données retournées ainsi que les choix
 * de l'utilisateur :
 *
 * - navires sélectionnés ;
 * - période sélectionnée ;
 * - variables sélectionnées.
 */
let result;
let selectedVessels;
let selectedStartDate;
let selectedEndDate;
let selectedVariables;


findButton.addEventListener("click", async () => {

    // Supprimer les résultats de la recherche précédente
    // et nettoyer la carte.
    clearMap();


    // -------------------- Entrées utilisateur --------------------

    selectedVessels = Array.from(
        vesselOptions.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ).map(checkbox => checkbox.value);

    selectedStartDate = startDateInput.value;
    selectedEndDate = endDateInput.value;

    selectedVariables = Array.from(
        variableOptions.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ).map(checkbox => checkbox.value);


    // -------------------- Requête HTTP --------------------

    let params = new URLSearchParams();

    selectedVessels.forEach(vessel => {
        params.append("vessels", vessel);
    });

    selectedVariables.forEach(variable => {
        params.append("variables", variable);
    });

    params.append("start_date", selectedStartDate);
    params.append("end_date", selectedEndDate);

    let requestURL = "/api/data/?" + params.toString();

    let response = await fetch(requestURL);
    result = await response.json();


    // -------------------- Gestion des erreurs --------------------

    if (response.ok === false) {
        messagesDiv.textContent = result.error;
        return;
    }

    messagesDiv.textContent = JSON.stringify(result.warnings);


    // -------------------- Affichage des graphes --------------------

    /*
     * Supprimer les graphes issus de la recherche précédente.
     *
     * Cette opération est réalisée une seule fois ici et non dans
     * les fonctions de charts.js, car une même recherche peut créer
     * plusieurs canvas lorsque plusieurs variables et plusieurs
     * navires sont sélectionnés.
     */
    chartDiv.replaceChildren();


    if (selectedVariables.length === 1) {

        /*
         * Une seule variable :
         * créer un graphe contenant une courbe par navire sélectionné.
         */
        displayChartOneVariable(
            result,
            selectedVessels,
            selectedVariables[0],
            variablesMetadata,
            variablesByType
        );

    } else if (
        selectedVariables.length > 1 &&
        selectedVessels.length === 1
    ) {

        /*
         * Plusieurs variables et un seul navire :
         * afficher les variables sur un même graphe.
         *
         * Les variables compatibles peuvent partager le même axe Y
         * selon la logique définie dans charts.js.
         */
        displayChartOneVessel(
            result,
            selectedVessels[0],
            selectedVariables,
            variablesMetadata,
            variablesByType
        );

    } else if (
        selectedVariables.length > 1 &&
        selectedVessels.length > 1
    ) {

        /*
         * Plusieurs variables et plusieurs navires :
         * l'utilisateur choisit la manière d'organiser les graphes.
         *
         * Vue "variable" :
         *     un canvas par variable,
         *     avec une courbe par navire.
         *
         * Vue "vessel" :
         *     un canvas par navire,
         *     avec une courbe par variable.
         */
        if (chartViewSelect.value === "variable") {

            selectedVariables.forEach(variable => {
                displayChartOneVariable(
                    result,
                    selectedVessels,
                    variable,
                    variablesMetadata,
                    variablesByType
                );
            });

        } else if (chartViewSelect.value === "vessel") {

            selectedVessels.forEach(vessel => {
                displayChartOneVessel(
                    result,
                    vessel,
                    selectedVariables,
                    variablesMetadata,
                    variablesByType
                );
            });
        }
    }


    // -------------------- Paramètres de colorimétrie --------------------

    let variablePilot = colorVariableSelect.value;

    /*
     * Les valeurs des inputs sont conservées sous forme de chaînes.
     *
     * Cela permet de distinguer :
     *
     * ""  -> champ vide
     * "0" -> valeur réellement saisie par l'utilisateur
     */
    let addedReferenceValue = referenceInput.value;
    let addedToleranceValue = toleranceInput.value;


    // -------------------- Affichage de la carte --------------------

    displayMap(
        result,
        selectedVessels,
        variablePilot,
        addedReferenceValue,
        addedToleranceValue,
        variablesByType
    );
});


// -------------------- Sélecteur de colorimétrie --------------------

variableOptions.addEventListener("change", () => {
    selectedVariables = Array.from(
        variableOptions.querySelectorAll(
            'input[type="checkbox"]:checked'
        )
    ).map(checkbox => checkbox.value);

    /*
     * Vider la liste avant de la reconstruire.
     *
     * Sans cela, chaque événement "change"
     * ajouterait de nouveau les mêmes variables
     * au sélecteur de colorimétrie.
     *
     * Cela permet aussi de supprimer automatiquement
     * les variables qui viennent d'être désélectionnées.
     */
    
    colorVariableSelect.options.length = 1;
    

    selectedVariables.forEach(variable => {

        /*
         * Les variables MACS3 représentent des mesures
         * ponctuelles / snapshots.
         *
         * Elles ne sont donc pas proposées comme variables
         * pilotes pour colorer une trajectoire continue.
         */
        if (!variablesByType["MACS3"].includes(variable)) {
            let option = document.createElement("option");

            option.value = variable;
            option.textContent = variable;

            colorVariableSelect.appendChild(option);
        }
    });
});


// -------------------- Fermeture des menus déroulants --------------------

/*
 * Fermer les menus Vessels et Variables lorsque l'utilisateur
 * clique en dehors du menu concerné.
 */
document.addEventListener("click", event => {

    if (!vesselDropdown.contains(event.target)) {
        vesselDropdown.open = false;
    }

    if (!variablesDropdown.contains(event.target)) {
        variablesDropdown.open = false;
    }
});


// -------------------- Replay --------------------

/*
 * Timeline utilisée par le replay.
 *
 * Elle est reconstruite lorsqu'un nouveau replay est demandé
 * à partir de la période sélectionnée lors du dernier Find.
 *
 * La timeline progresse par pas réguliers de 15 minutes,
 * indépendamment des timestamps réellement présents dans les données.
 * replay.js recherche ensuite l'état disponible de chaque navire
 * pour chacun de ces instants.
 */
let replayTimeline;


replayButton.addEventListener("click", () => {

    /*
     * Un nouveau replay doit toujours repartir du premier instant
     * de la timeline, même si le replay précédent avait déjà avancé.
     */
    i = 0;

    // Construire la timeline correspondant
    // à toute la période sélectionnée.
    replayTimeline = createReplayTimeline(
        selectedStartDate,
        selectedEndDate
    );
    document.body.classList.add("replay-mode");
    buildReplayTableHeader(selectedVariables, variablesByType);
    
    
    
});

exitReplayButton.addEventListener("click",() => {
    
    // revenir à l'état normale de la carte et de l'interface
    clearInterval(replayInterval);
    replayInterval = null;
    let variablePilot = colorVariableSelect.value;
    let addedReferenceValue = referenceInput.value;
    let addedToleranceValue = toleranceInput.value;
    clearMap();

    displayMap(
        result,
        selectedVessels,
        variablePilot,
        addedReferenceValue,
        addedToleranceValue,
        variablesByType
    );

    document.body.classList.remove("replay-mode")
})

