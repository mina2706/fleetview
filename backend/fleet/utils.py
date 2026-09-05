import pandas as pd
from pathlib import Path


def extract_file_info(file_name: str):
    """
    Extrait le nom du navire et le type de dataset à partir
    du nom d'un fichier CSV.

    Exemple :
    "2026-08-25 16_28_15_AAA GPS.csv"
    -> ("AAA", "GPS")
    """
    name_without_extension = Path(file_name).stem
    info_part = name_without_extension.split("_")[-1]

    vessel, dataset_type = info_part.split()

    # Corriger la faute présente dans le nom d'un des fichiers fournis.
    if dataset_type == "MASC3":
        dataset_type = "MACS3"

    return vessel, dataset_type


def find_files(folder_path: Path):
    """
    Retourne la liste des fichiers CSV présents dans le dossier.
    """
    return list(folder_path.glob("*.csv"))


def clean_timestamps(df: pd.DataFrame, column: str):
    """
    Convertit la colonne temporelle en datetime, supprime les timestamps
    invalides, trie les données chronologiquement et réinitialise l'index.

    Returns:
        tuple: Le DataFrame nettoyé et le nombre de lignes valides restantes.
    """
    df = df.copy()

    # Les timestamps invalides sont convertis en NaT.
    df[column] = pd.to_datetime(df[column], errors="coerce")

    # Supprimer les lignes dont le timestamp est invalide.
    df = df.dropna(subset=[column])

    valid_row_count = len(df)

    # Trier chronologiquement et reconstruire un index continu.
    df = df.sort_values(column)
    df = df.reset_index(drop=True)

    return df, valid_row_count


def validate_position(gps_df: pd.DataFrame):
    """
    Valide les coordonnées GPS et détermine si au moins
    une position exploitable est disponible.

    Returns:
        tuple: Le DataFrame avec les positions invalides neutralisées
        et un booléen indiquant si une position valide existe.
    """
    gps_df = gps_df.copy()
    position_available = False

    if "Latitude" in gps_df.columns and "Longitude" in gps_df.columns:
        invalid_longitude = (
            (gps_df["Longitude"] < -180)
            | (gps_df["Longitude"] > 180)
        )

        invalid_latitude = (
            (gps_df["Latitude"] < -90)
            | (gps_df["Latitude"] > 90)
        )

        # Conserver la ligne mais rendre indisponibles les coordonnées invalides.
        gps_df.loc[invalid_longitude, "Longitude"] = pd.NA
        gps_df.loc[invalid_latitude, "Latitude"] = pd.NA

        valid_position = (
            gps_df["Longitude"].notna()
            & gps_df["Latitude"].notna()
        )

        position_available = valid_position.any()

    return gps_df, position_available


def validate_dataset(
    missing_columns,
    valid_row_count,
    exploitable_data,
):
    """
    Vérifie qu'un dataset possède la structure minimale attendue
    et contient au moins une donnée exploitable.

    Returns:
        tuple: Un booléen indiquant si le dataset est valide
        et un message décrivant le résultat de la validation.
    """
    if (
        missing_columns == []
        and valid_row_count != 0
        and exploitable_data
    ):
        dataset_valid = True
        message = "The dataset is valid."

    else:
        dataset_valid = False

        if missing_columns != []:
            message = (
                f"Dataset invalid, missing required columns: "
                f"{missing_columns}"
            )

        elif valid_row_count == 0:
            message = (
                "Dataset invalid: no rows remain after "
                "timestamp cleaning."
            )

        else:
            message = (
                "Dataset invalid: timeline available but "
                "no exploitable data found."
            )

    return dataset_valid, message


def find_missing_columns(
    df: pd.DataFrame,
    required_columns: list,
):
    """
    Retourne les colonnes obligatoires absentes du DataFrame.
    """
    missing_columns = []

    for column in required_columns:
        if column not in df.columns:
            missing_columns.append(column)

    return missing_columns


def check_available_data(
    df: pd.DataFrame,
    optional_columns: list,
):
    """
    Vérifie qu'au moins une colonne optionnelle disponible
    contient une valeur non nulle.
    """
    available_columns = []

    for column in optional_columns:
        if column in df.columns:
            available_columns.append(column)

    data_available = (
        df[available_columns]
        .notna()
        .any()
        .any()
    )

    return data_available


def extract_metadata(df: pd.DataFrame):
    """
    Extrait les métadonnées présentes dans les noms de colonnes
    d'un fichier sans modifier le DataFrame.

    Pour chaque variable, conserve :
    - le nom brut de la colonne ;
    - son unité lorsqu'elle existe ;
    - sa source lorsqu'elle existe.

    Le nom normalisé de la variable est utilisé comme clé.
    """
    metadata_df = {}

    for column in df.columns:
        metadata_column = {
            "raw_name": column,
        }

        if "[" in column:
            name, remaining_part = column.split("[", 1)
            name = name.strip()

            unit, source = remaining_part.split("]", 1)

            unit = unit.strip()
            source = source.strip()

            # "-" indique qu'aucune unité physique n'est définie.
            if unit == "-":
                unit = None

            metadata_column["unit"] = unit
            metadata_column["source"] = source.strip("()")

        else:
            name = column.strip()
            metadata_column["unit"] = None
            metadata_column["source"] = None

        metadata_df[name] = metadata_column

    return metadata_df


def summarize_metadata(metadata: dict):
    """
    Regroupe les métadonnées de tous les navires par type de dataset.

    Les différentes valeurs observées pour un même champ sont conservées
    sous forme de listes afin de ne pas perdre les variantes présentes
    entre les fichiers.
    """
    common_metadata = {}

    for vessel in metadata:
        for dataset_type in metadata[vessel]:
            dataset_metadata = metadata[vessel][dataset_type]

            # Initialiser le type de dataset lors de sa première occurence.
            if dataset_type not in common_metadata:
                common_metadata[dataset_type] = {}

                for variable in dataset_metadata:
                    common_metadata[dataset_type][variable] = {}

                    initialize_variable_metadata(
                        dataset_metadata[variable],
                        common_metadata[dataset_type][variable],
                    )

            else:
                for variable in dataset_metadata:
                    variable_metadata = dataset_metadata[variable]

                    if variable in common_metadata[dataset_type]:
                        common_variable_metadata = (
                            common_metadata[dataset_type][variable]
                        )

                        # Ajouter uniquement les nouvelles variantes observées.
                        for metadata_field in variable_metadata:
                            field_value = variable_metadata[metadata_field]

                            if (
                                field_value is not None
                                and field_value
                                not in common_variable_metadata[metadata_field]
                            ):
                                common_variable_metadata[
                                    metadata_field
                                ].append(field_value)

                    else:
                        # Initialiser une variable absente du schéma commun.
                        common_metadata[dataset_type][variable] = {}

                        initialize_variable_metadata(
                            variable_metadata,
                            common_metadata[dataset_type][variable],
                        )

    return common_metadata


def initialize_variable_metadata(
    variable_metadata: dict,
    common_variable_metadata: dict,
    ):
    """
    Initialise les métadonnées communes d'une variable.

    Chaque valeur observée est placée dans une liste afin de permettre
    l'ajout ultérieur de variantes provenant d'autres fichiers.
    Les valeurs None ne sont pas considérées comme des variantes.
    """
    for field in variable_metadata:
        common_variable_metadata[field] = []

        if variable_metadata[field] is not None:
            common_variable_metadata[field].append(
                variable_metadata[field]
            )