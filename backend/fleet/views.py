from django.http import JsonResponse
from django.apps import apps
from django.shortcuts import render
import pandas as pd


# Les données et métadonnées ont déjà été chargées en mémoire
# au démarrage de l'application dans FleetConfig.ready().
fleet_config = apps.get_app_config("fleet")


def vessels(request):
    """Retourne la liste des navires réellement chargés."""
    vessels_names = list(fleet_config.data.keys())

    return JsonResponse({
        "vessels": vessels_names
    })


def variables(request):
    """Retourne le catalogue global des variables et leurs métadonnées."""
    return JsonResponse({
        "variables": fleet_config.common_metadata
    })


def data(request):
    """Retourne les séries filtrées, les warnings et le contexte MACS3 du Replay."""

    vessels = request.GET.getlist("vessels")
    start_date = request.GET.get("start_date")
    end_date = request.GET.get("end_date")
    variables = request.GET.getlist("variables")

    # ---------------------------------------------------------
    # 1. Validation des navires
    # ---------------------------------------------------------

    unknown_vessels = []
    valid_vessels = []

    if vessels != []:
        for vessel in vessels:
            if vessel in fleet_config.data:
                valid_vessels.append(vessel)
            else:
                unknown_vessels.append(vessel)

        # Si aucun navire demandé n'existe, la requête ne peut pas être traitée.
        if valid_vessels == []:
            return JsonResponse(
                {"error": "no valid vessels"},
                status=400
            )

    else:
        return JsonResponse(
            {"error": "no vessels in the request"},
            status=400
        )

    # ---------------------------------------------------------
    # 2. Validation de la période
    # ---------------------------------------------------------

    # Conversion en datetime uniquement pour vérifier que les valeurs reçues
    # existent et représentent bien des dates valides.
    start_date = pd.to_datetime(start_date, errors="coerce")
    end_date = pd.to_datetime(end_date, errors="coerce")

    if pd.isna(start_date) or pd.isna(end_date):
        return JsonResponse(
            {
                "error":
                "period not valid, start or/and end date missing/invalid"
            },
            status=400
        )

    if start_date > end_date:
        return JsonResponse(
            {
                "error":
                "period not valid, start date is after end date"
            },
            status=400
        )

    # Les paramètres start_date et end_date représentent des dates sans heure.
    # On compare donc uniquement la partie date des timestamps.
    start_date = start_date.date()
    end_date = end_date.date()

    # ---------------------------------------------------------
    # 3. Vérification des variables demandées
    # ---------------------------------------------------------

    # Préparer les colonnes par navire/dataset ; GPS conserve ses coordonnées.

    availables_variables = {}
    not_availables_variables = {}
    unknown_variables = []

    # Initialisation à partir des datasets réellement disponibles
    # pour chaque navire valide.
    for vessel in valid_vessels:
        availables_variables[vessel] = {}

        for dataset_type in fleet_config.data[vessel]:
            availables_variables[vessel][dataset_type] = ["Timestamp"]

            if dataset_type == "GPS":
                if (
                    "Longitude"
                    in fleet_config.data[vessel][dataset_type].columns
                    and "Latitude"
                    in fleet_config.data[vessel][dataset_type].columns
                ):
                    availables_variables[vessel][dataset_type] += [
                        "Longitude",
                        "Latitude"
                    ]

        not_availables_variables[vessel] = []

    # Préparer les colonnes par navire/dataset ; GPS conserve ses coordonnées.

    for variable in variables:
        found = False

        for dataset_type in fleet_config.common_metadata:
            if variable in fleet_config.common_metadata[dataset_type]:
                found = True

                for vessel in availables_variables:

                    # Le navire possède le dataset correspondant.
                    if dataset_type in availables_variables[vessel]:

                        # Et la colonne existe réellement dans ses données.
                        if (
                            variable
                            in fleet_config.data[vessel][dataset_type].columns
                        ):
                            availables_variables[vessel][dataset_type].append(
                                variable
                            )

                        else:
                            not_availables_variables[vessel].append(variable)

                    # Le dataset entier n'existe pas pour ce navire.
                    else:
                        not_availables_variables[vessel].append(variable)

        if found == False:
            unknown_variables.append(variable)

    # ---------------------------------------------------------
    # 4. Construction de la réponse
    # ---------------------------------------------------------

    # Réponse filtrée pour l’affichage ; historique MACS3 complet pour le Replay.

    response_data = {}
    replay_context = {}

    for vessel in availables_variables:
        response_data[vessel] = {}
        replay_context[vessel] = []

        for dataset_type in availables_variables[vessel]:
            dataframe = fleet_config.data[vessel][dataset_type]

            # Pour le replay, MACS3 doit conserver son historique complet :
            # un état reste valable jusqu'à l'arrivée du snapshot suivant.
            if dataset_type == "MACS3":
                macs3_df = dataframe.astype(object).where(
                    dataframe.notna(),
                    None
                )
                replay_context[vessel] = macs3_df.to_dict(orient="records")

            filtered_df = dataframe.loc[
                (dataframe["Timestamp"].dt.date >= start_date)
                & (dataframe["Timestamp"].dt.date <= end_date)
            ]

            # Sélectionner uniquement les colonnes à retourner pour ce navire et ce dataset.
            json_ready_df = filtered_df[
                availables_variables[vessel][dataset_type]
            ]

            if availables_variables[vessel][dataset_type] != ["Timestamp"]:
                # Remplacer les NaN pandas par None avant la sérialisation JSON.
                json_ready_df = json_ready_df.astype(object).where(
                    json_ready_df.notna(),
                    None
                )
                response_data[vessel][dataset_type] = json_ready_df.to_dict(
                    orient="records"
                )

    # Les problèmes partiels ne bloquent pas la réponse :
    # les données valides sont renvoyées avec les warnings correspondants.
    return JsonResponse({
        "response": response_data,
        "replay_context": replay_context,
        "warnings": {
            "unknown_vessels": unknown_vessels,
            "unknown_variables": unknown_variables,
            "not_available_variables": not_availables_variables
        }
    })


def index(request):
    return render(request, "fleet/index.html")