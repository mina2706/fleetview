import pandas as pd 
from pathlib import Path

# 1) Construire le path des datasets:
BASE_DIR = Path(__file__).parent.parent.parent
data_path = BASE_DIR/"data"
aaa_gps_path = data_path/"2026-08-25 16_28_15_AAA GPS.csv"

# 2) lire les fichier CSV et construire le Dataframe pandas
aaa_gps_df = pd.read_csv(aaa_gps_path)

# 3) vérifier si le dataset contient les columns requise pour qu'il soit exploitable:
# Ex: pour que le dataset GPS soit valide : il faut au moins avoir les colonnes "Timestamp" et "Latitude [deg] (NAVIGATION_GPS)","Longitude [deg] (NAVIGATION_GPS)"
# listes des columns requise pour GPS 
required_columns = ["Timestamp","Latitude [deg] (NAVIGATION_GPS)","Longitude [deg] (NAVIGATION_GPS)"]

# test de validité : colonnes requises sont tous là ? 
missing = []
for rc in required_columns:
    if rc not in aaa_gps_df.columns:
        missing.append(rc)    
if missing == []: 
    print("on a ce qu'il faut")
    # alors on continue le traitement

    # 4) convertir le timestamp (str) sous format datetime pour pouvoir l'exploiter dans el replay
    # si une timestamp est mal convertie, avec error coerce on la rempalce part NaT (Not a Time)
    aaa_gps_df["Timestamp"] =pd.to_datetime(aaa_gps_df["Timestamp"],errors="coerce")
    nb_t_invalide = aaa_gps_df["Timestamp"].isna().sum()


    # 5) on nettoie le dataset des lignes Nat selon la colonne eliminatoire "Timestamp" avec subset 
    aaa_gps_df = aaa_gps_df.dropna(subset=["Timestamp"])
    # nombre de timestamps valide restantes : 
    nb_t_valide = len(aaa_gps_df)

    # 6) on trie le dataset par timestamp
    aaa_gps_df = aaa_gps_df.sort_values("Timestamp")

    # 7) on reindexe le dataset pour avoir une indexsation continue aprés la supression des lignes NaT
    aaa_gps_df = aaa_gps_df.reset_index(drop=True)

    # 8) on renomme les colonnes avec des noms simples 
    aaa_gps_df = aaa_gps_df.rename(columns={
                                "Timestamp": "timestamp",
                                "Course [deg] (NAVIGATION_GPS)" : "course",
                                "Heading [deg] (NAVIGATION_GYRO)":"heading",
                                "Latitude [deg] (NAVIGATION_GPS)":"latitude",
                                "Longitude [deg] (NAVIGATION_GPS)":"longitude",
                                "Speed [kn] (NAVIGATION_GPS)" : "sog" 
                            })

    # 9) valider lg/lt :
    # utilser les masques pandas qui traitent toute une colonne à la fois ( remplace les boucles de parcours)  : 
    lg_invalide = (aaa_gps_df["longitude"] < -180)|(aaa_gps_df["longitude"] > 180)
    lt_invalide = (aaa_gps_df["latitude"] < -90)|(aaa_gps_df["latitude"] > 90)
    # compter lg/lt invalide avant de les rempalcer par NaN et ce mélanger avec les donnée non disponible de base  : 
    nb_lg_invalide = lg_invalide.sum()
    nb_lt_invalide = lt_invalide.sum()
    
    # remplacer les valeurs invalide par NaN
    # loc sélectionne les lignes où la condition est vraie dans la colonne longitude,
    # puis remplace ces valeurs invalides par NA
    aaa_gps_df.loc[lg_invalide, "longitude"] = pd.NA
    aaa_gps_df.loc[lt_invalide, "latitude"]= pd.NA

    # trouver une ligne où lt et lg sont disponible
    pos_valide = aaa_gps_df["longitude"].notna() & aaa_gps_df["latitude"].notna() 

    # 11) trouver une ligne qui a au moins une pos valide ou une des autres trois variables :
    opt_columns = [ "course","heading","sog" ]
    availeble_opt = []
    for opt in opt_columns: 
        if opt in aaa_gps_df.columns :
            availeble_opt.append(opt)

    opt_exploitable = aaa_gps_df[availeble_opt].notna().any().any()
    data_exploitable = pos_valide.any() or opt_exploitable 
    
else : # pas_la n'est pas vide 
    print("non ", missing, "manquent")

# 11) Contrôle final
# dataset valide ?
if missing == [] and nb_t_valide != 0 and data_exploitable:
    dataset_valide = True
    print ( "le dataset est valide")
else :
    dataset_valide = False
    if missing != []:
        print ( "le dataset n'est pas valide", missing, "manquent")
    elif  nb_t_valide == 0 :
        print( "aprés les nettoyage par timestamps, il reste aucune ligne dans le dataset ")
    else : 
        print (" la dataset contient qu'une timeline, aucune donnée exploitable")

######################################### MOTION #########################################################################################
# 1) Construire le path des datasets:
aaa_motion_path = data_path/"2026-08-25 16_44_39_AAA MOTIONS.csv"
# 2) lire les fichier CSV et construire le Dataframe pandas
aaa_motion_df = pd.read_csv(aaa_motion_path)

# 3) vérifier si le dataset contient les columns requise pour qu'il soit exploitable:
# Ex: pour que le dataset MOTION soit valide : il faut au moins avoir les colonnes "Timestamp" 

# test de validité : colonnes requises sont tous là ? 
required_motion = "Timestamp"
not_missing_motion = False
if required_motion in aaa_motion_df.columns: 
    not_missing_motion = True
    print("on a ce qu'il faut")
    
    # alors on continue le traitement
    # 4) convertir le timestamp (str) sous format datetime pour pouvoir l'exploiter dans el replay
    # si une timestamp est mal convertie, avec error coerce on la rempalce part NaT (Not a Time)
    aaa_motion_df["Timestamp"] =pd.to_datetime(aaa_motion_df["Timestamp"],errors="coerce")
    nb_t_invalide_motion = aaa_motion_df["Timestamp"].isna().sum()


    # 5) on nettoie le dataset des lignes Nat selon la colonne eliminatoire "Timestamp" avec subset 
    aaa_motion_df = aaa_motion_df.dropna(subset=["Timestamp"])
    # nombre de timestamps valide restantes : 
    nb_t_valide_motion = len(aaa_motion_df)

    # 6) on trie le dataset par timestamp
    aaa_motion_df = aaa_motion_df.sort_values("Timestamp")

    # 7) on reindexe le dataset pour avoir une indexsation continue aprés la supression des lignes NaT
    aaa_motion_df = aaa_motion_df.reset_index(drop=True)

    # 8) on renomme les colonnes avec des noms simples 
    # je renomme pas
    
    # 11) vérifier qu’au moins une variable MOTION contient une donnée
    opt_columns_motion = aaa_motion_df.columns[1:] # le reste des varaibles à part timestamp
    data_exploitable_motion = aaa_motion_df[opt_columns_motion].notna().any().any()
    
else : # pas_la n'est pas vide 
    print("non ", required_motion, "manquent")

# 11) Contrôle final
# dataset valide ?
if not_missing_motion  and nb_t_valide_motion != 0 and data_exploitable_motion:
    dataset_valide_motion = True
    print ( "le dataset est valide")
else :
    dataset_valide_motion = False
    if not not_missing_motion :
        print ( "le dataset n'est pas valide", required_motion, "manquent")
    elif  nb_t_valide_motion == 0 :
        print( "aprés les nettoyage par timestamps, il reste aucune ligne dans le dataset ")
    else : 
        print (" la dataset contient qu'une timeline, aucune donnée exploitable")

######################################### MACS3 #########################################################################################
# 1) Construire le path des datasets:
aaa_macs3_path = data_path/"2026-08-25 16_39_45_AAA MACS3.csv"
# 2) lire les fichier CSV et construire le Dataframe pandas
aaa_macs3_df = pd.read_csv(aaa_macs3_path)
# 3) vérifier si le dataset contient les columns requise pour qu'il soit exploitable:
# Ex: pour que le dataset MACS3 soit valide : il faut au moins avoir les colonnes "Timestamp" 

# test de validité : colonnes requises sont tous là ? 
required_macs3 = "Timestamp"
not_missing_macs3 = False
if required_macs3 in aaa_macs3_df.columns: 
    not_missing_macs3 = True
    print("on a ce qu'il faut")
    
    # alors on continue le traitement
    # 4) convertir le timestamp (str) sous format datetime pour pouvoir l'exploiter dans el replay
    # si une timestamp est mal convertie, avec error coerce on la rempalce part NaT (Not a Time)
    aaa_macs3_df["Timestamp"] =pd.to_datetime(aaa_macs3_df["Timestamp"],errors="coerce")
    nb_t_invalide_macs3 = aaa_macs3_df["Timestamp"].isna().sum()


    # 5) on nettoie le dataset des lignes Nat selon la colonne eliminatoire "Timestamp" avec subset 
    aaa_macs3_df = aaa_macs3_df.dropna(subset=["Timestamp"])
    # nombre de timestamps valide restantes : 
    nb_t_valide_macs3 = len(aaa_macs3_df)

    # 6) on trie le dataset par timestamp
    aaa_macs3_df = aaa_macs3_df.sort_values("Timestamp")

    # 7) on reindexe le dataset pour avoir une indexsation continue aprés la supression des lignes NaT
    aaa_macs3_df = aaa_macs3_df.reset_index(drop=True)

    # 8) on renomme les colonnes avec des noms simples 
    # je renomme pas
    
    # 11) vérifier qu’au moins une variable MACS3 contient une donnée :
    opt_columns_macs3 = aaa_macs3_df.columns[1:] # le reste des varaibles à part timestamp
    data_exploitable_macs3 = aaa_macs3_df[opt_columns_macs3].notna().any().any()
    
else : # pas_la n'est pas vide 
    print("non ", required_macs3, "manquent")

# 11) Contrôle final
# dataset valide ?
if not_missing_macs3  and nb_t_valide_macs3 != 0 and data_exploitable_macs3:
    dataset_valide_macs3 = True
    print ( "le dataset est valide")
else :
    dataset_valide_macs3 = False
    if not not_missing_macs3 :
        print ( "le dataset n'est pas valide", required_macs3, "manquent")
    elif  nb_t_valide_macs3 == 0 :
        print( "aprés les nettoyage par timestamps, il reste aucune ligne dans le dataset ")
    else : 
        print (" la dataset contient qu'une timeline, aucune donnée exploitable")
