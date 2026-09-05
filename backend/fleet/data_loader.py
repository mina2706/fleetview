import pandas as pd

from utils import (
    clean_timestamps,
    validate_position,
    validate_dataset,
    check_available_data,
    find_missing_columns,
    find_files,
    extract_file_info,
    extract_metadata,
    summarize_metadata,
)


def load_all_data(data_path):
    """
    Charge tous les fichiers CSV, extrait leurs métadonnées,
    normalise les noms de colonnes et nettoie les données.

    Args:
        data_path: Dossier contenant les fichiers CSV.

    Returns:
        tuple: Les données nettoyées et les métadonnées communes.
    """
    data = {}
    metadata = {}

    csv_files = find_files(data_path)

    for file_path in csv_files:
        vessel, dataset_type = extract_file_info(file_path)

        # Initialiser les dictionnaires du navire lors de sa première rencontre.
        if vessel not in data:
            data[vessel] = {}

        if vessel not in metadata:
            metadata[vessel] = {}

        raw_df = pd.read_csv(file_path)

        # Extraire les métadonnées avant de renommer les colonnes afin de
        # conserver le nom brut, l'unité et la source présents dans le CSV.
        metadata[vessel][dataset_type] = extract_metadata(raw_df)

        # Les clés retournées par extract_metadata correspondent aux noms
        # métier normalisés des colonnes du fichier courant.
        normalized_column_names = list(
            metadata[vessel][dataset_type].keys()
        )
        raw_df.columns = normalized_column_names

        # Appliquer le traitement adapté au type de données.
        if dataset_type == "GPS":
            clean_df = process_gps_data(raw_df)
        else:
            clean_df = process_motion_macs3_data(raw_df)

        data[vessel][dataset_type] = clean_df

    # Résumer les métadonnées après le chargement de tous les fichiers afin
    # de conserver les éventuelles variantes observées entre les navires.
    common_metadata = summarize_metadata(metadata)

    return data, common_metadata


def process_gps_data(df: pd.DataFrame):
    """
    Nettoie et valide un dataset GPS.

    Args:
        df: DataFrame GPS à traiter.

    Returns:
        DataFrame nettoyé, ou None si le dataset n'est pas exploitable.
    """
    required_columns = ["Timestamp"]
    missing_columns = find_missing_columns(df, required_columns)

    valid_timestamp_rows = 0
    exploitable_data = False

    if missing_columns == []:
        clean_df, valid_timestamp_rows = clean_timestamps(
            df,
            required_columns[0],
        )

        # Vérifier qu'au moins une position GPS est exploitable.
        clean_df, valid_position = validate_position(clean_df)

        # Le dataset reste exploitable sans position si d'autres variables
        # GPS contiennent des données utilisables.
        optional_columns = ["Course", "Heading", "Speed"]

        gps_data_available = check_available_data(
            clean_df,
            optional_columns,
        )

        exploitable_data = valid_position or gps_data_available

    dataset_valid, _ = validate_dataset(
        missing_columns,
        valid_timestamp_rows,
        exploitable_data,
    )

    if not dataset_valid:
        clean_df = None

    return clean_df


def process_motion_macs3_data(df: pd.DataFrame):
    """
    Nettoie et valide un dataset MOTIONS ou MACS3.

    Args:
        df: DataFrame MOTIONS ou MACS3 à traiter.

    Returns:
        DataFrame nettoyé, ou None si le dataset n'est pas exploitable.
    """
    required_columns = ["Timestamp"]
    missing_columns = find_missing_columns(df, required_columns)

    valid_timestamp_rows = 0
    exploitable_data = False

    if missing_columns == []:
        clean_df, valid_timestamp_rows = clean_timestamps(
            df,
            required_columns[0],
        )

        # Toutes les colonnes sauf Timestamp correspondent à des données
        # exploitables potentielles du dataset.
        optional_columns = [
            column
            for column in clean_df.columns
            if column != "Timestamp"
        ]

        exploitable_data = check_available_data(
            clean_df,
            optional_columns,
        )

    dataset_valid, _ = validate_dataset(
        missing_columns,
        valid_timestamp_rows,
        exploitable_data,
    )

    if not dataset_valid:
        clean_df = None

    return clean_df