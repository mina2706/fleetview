import pandas as pd
from pathlib import Path


def extract_file_info(file_name: str):
    """
    Extract the vessel name and dataset type from a CSV file name.

    Example:
    "2026-08-25 16_28_15_AAA GPS.csv"
    -> ("AAA", "GPS")
    """
    name_without_extension = Path(file_name).stem
    info_part = name_without_extension.split("_")[-1]

    vessel, dataset_type = info_part.split()

    # Normalize the typo present in one of the provided files.
    if dataset_type == "MASC3":
        dataset_type = "MACS3"

    return vessel, dataset_type


def find_files(folder_path: Path):
    """Return all CSV files found in the given folder."""
    return list(folder_path.glob("*.csv"))


def clean_timestamps(df: pd.DataFrame, column: str):
    """
    Convert the timestamp column to datetime, remove invalid timestamps,
    sort the DataFrame chronologically and reset its index.

    Returns the cleaned DataFrame and the number of remaining valid rows.
    """
    df = df.copy()

    # Invalid timestamps are converted to NaT.
    df[column] = pd.to_datetime(df[column], errors="coerce")

    # Remove rows with an invalid timestamp.
    df = df.dropna(subset=[column])

    valid_row_count = len(df)

    # Sort chronologically and rebuild a continuous index.
    df = df.sort_values(column)
    df = df.reset_index(drop=True)

    return df, valid_row_count


def validate_position(gps_df: pd.DataFrame):
    """
    Validate GPS coordinates and determine whether at least one
    usable position is available.
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

        # Keep the row but mark invalid coordinates as unavailable.
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
    Determine whether a dataset contains the minimum required
    structure and exploitable data.
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
    """Return required columns that are missing from the DataFrame."""
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
    Return True if at least one available optional column
    contains a non-null value.
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


def normalize_column_names(df: pd.DataFrame):
    """
    Normalize GPS column names by keeping only their stable
    business name.

    Example:
    "Course [deg] (NAVIGATION_GPS)" -> "Course"
    """
    normalized_column_names = []

    for column in df.columns:
        if "[" in column:
            column, _ = column.split("[")

        normalized_column_names.append(column.strip())

    df.columns = normalized_column_names

    return df.columns