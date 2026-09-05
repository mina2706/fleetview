import pandas as pd


from utils import (
    normalize_column_names,
    clean_timestamps,
    validate_position,
    validate_dataset,
    check_available_data,
    find_missing_columns,
    find_files,
    extract_file_info,
)


def load_all_data(data_path):
    data = {}
    csv_files = find_files(data_path)

    for file_path in csv_files:
        vessel, dataset_type = extract_file_info(file_path)

        if vessel not in data:
            data[vessel] = {}

        raw_df = pd.read_csv(file_path)

        if dataset_type == "GPS":
            clean_df = process_gps_data(raw_df)
        else:
            clean_df = process_motion_macs3_data(raw_df)

        data[vessel][dataset_type] = clean_df

    return data


def process_gps_data(df: pd.DataFrame):
    # Les fichiers GPS n'utilisent pas tous les mêmes noms de colonnes.
    df.columns = normalize_column_names(df)

    required_columns = ["Timestamp"]
    missing_columns = find_missing_columns(df, required_columns)

    valid_timestamp_rows = 0
    exploitable_data = False

    if missing_columns == []:
        clean_df, valid_timestamp_rows = clean_timestamps(
            df,
            required_columns[0],
        )

        # Vérifie qu'au moins une position GPS est exploitable.
        clean_df, valid_position = validate_position(clean_df)

        # Le dataset reste exploitable sans position si d'autres
        # variables GPS contiennent des données.
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
    required_columns = ["Timestamp"]
    missing_columns = find_missing_columns(df, required_columns)

    valid_timestamp_rows = 0
    exploitable_data = False

    if missing_columns == []:
        clean_df, valid_timestamp_rows = clean_timestamps(
            df,
            required_columns[0],
        )

        # Toutes les colonnes sauf Timestamp sont des données de mesure.
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


