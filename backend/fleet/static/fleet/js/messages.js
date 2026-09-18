// -------------------- Élément HTML --------------------

let messagesDiv = document.getElementById("messages");


// -------------------- Nettoyage --------------------

function clearMessages() {
    messagesDiv.replaceChildren();
}


// -------------------- Erreurs --------------------

function showError(errorMessage) {

    clearMessages();

    let errorContainer = document.createElement("div");

    errorContainer.classList.add("error-message");
    errorContainer.textContent = `✕ ${errorMessage}`;

    messagesDiv.appendChild(errorContainer);
}


// -------------------- Warnings --------------------

function addWarning(message) {

    let warningContainer = document.createElement("div");

    warningContainer.classList.add("warning-message");
    warningContainer.textContent = `⚠ ${message}`;

    messagesDiv.appendChild(warningContainer);
}


function showWarnings(warnings) {

    clearMessages();


    // Navires inconnus
    warnings.unknown_vessels.forEach(vessel => {

        addWarning(
            `Unknown vessel: ${vessel}`
        );
    });


    // Variables inconnues
    warnings.unknown_variables.forEach(variable => {

        addWarning(
            `Unknown variable: ${variable}`
        );
    });


    // Variables connues mais indisponibles pour certains navires
    Object.entries(warnings.not_available_variables).forEach(
        ([vessel, variables]) => {

            variables.forEach(variable => {

                addWarning(
                    `Variable "${variable}" is not available for vessel ${vessel}`
                );
            });
        }
    );
}

