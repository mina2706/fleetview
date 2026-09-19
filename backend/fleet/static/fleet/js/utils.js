// -------------------- Construction de la timeline --------------------

// Timeline complète de 00:00 à 23:45, par pas de 15 min, même sans mesure.


function createTimeline(selectedStartDate, selectedEndDate) {

    // UTC sert ici au calcul sans changement d’heure ; le fuseau réel des CSV est inconnu.

    let startDate = new Date(selectedStartDate + "T00:00:00Z");
    let endDate = new Date(selectedEndDate + "T00:00:00Z");

    // Inclure la journée de fin jusqu’à 23:45.

    endDate.setUTCDate(endDate.getUTCDate() + 1);

    let nextTime = startDate.getTime();
    let step = 15 * 60 * 1000;
    let replayTimeline = [];

    while (nextTime < endDate.getTime()) {
        replayTimeline.push(new Date(nextTime));
        nextTime = nextTime + step;
    }

    return replayTimeline;
}

function formatUtcTick(value, unit) {

    let date = new Date(value);

    let options = {
        timeZone: "UTC"
    };

    if (
        unit === "millisecond" ||
        unit === "second" ||
        unit === "minute" ||
        unit === "hour"
    ) {
        options.hour = "2-digit";
        options.minute = "2-digit";
    }

    else if (unit === "day" || unit === "week") {
        options.day = "2-digit";
        options.month = "short";
    }

    else if (unit === "month" || unit === "quarter") {
        options.month = "short";
        options.year = "numeric";
    }

    else if (unit === "year") {
        options.year = "numeric";
    }

    return date.toLocaleString(undefined, options);
}

function formatUtcTooltip(value) {

    let date = new Date(value);

    return date.toLocaleString(undefined, {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
}