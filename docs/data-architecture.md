# Premières réflexions sur le stockage des données

Cette note résume les principaux choix de conception étudiés autour du stockage des données navires et de la météo mondiale pour FleetView. Elle complète le prototype construit à partir des fichiers CSV fournis.

## 1. Modèle de données pour les navires

Les données reçues sont organisées en trois familles distinctes : **GPS**, **MOTIONS** et **MACS3**. J’ai conservé cette séparation dans le modèle de données, avec une table de mesures par famille.

Le modèle s’appuie sur les tables principales suivantes :

| Table | Rôle |
|---|---|
| `vessel` | Identité du navire. |
| `source` | Origine déclarée d’une mesure. |
| `gps` | Coordonnées et mesures de navigation. |
| `motions` | Mesures de mouvement du navire. |
| `macs3` | Mesures de chargement et de stabilité. |
| `variable_metadata` | Nom de la variable, famille, unité et source associée. |

Les tables `gps`, `motions` et `macs3` sont reliées au navire par `vessel_id` et à la provenance de la mesure par `source_id`.

La table `variable_metadata` permet de conserver les informations nécessaires pour interpréter les variables : leur famille, leur nom, leur unité et leur source. Elle possède un identifiant propre `metadata_id`, car une même source peut fournir plusieurs variables.

Lorsque deux sources fournissent une mesure au même instant, les deux observations restent distinctes grâce à leur `source_id`. La provenance de la donnée est ainsi conservée avec la mesure.

### Timestamps et valeurs manquantes

Chaque famille conserve ses propres timestamps. Les observations GPS, MOTIONS et MACS3 ne sont donc pas forcées à partager les mêmes instants.


Les colonnes de mesures restent indépendamment nullables. Par exemple, une ligne GPS peut conserver `Speed`, `Course` ou `Heading` même si `Latitude` et `Longitude` sont absentes.

Lorsqu’aucune observation n’existe à un instant donné, aucune ligne artificielle n’est ajoutée dans la base. Les éventuelles grilles de temps utilisées pour l’affichage sont construites au moment de la consultation.

### Identification des observations

Chaque table de mesures possède une clé primaire technique (`gps_id`, `motion_id` ou `macs3_id`).

Pour détecter les doublons lors de l’intégration, la combinaison suivante peut également servir de référence métier :

`vessel_id + source_id + timestamp`

Elle permet de distinguer deux observations prises au même instant lorsqu’elles proviennent de sources différentes.

### Index pour les recherches FleetView

La requête principale de FleetView consiste à récupérer les mesures d’un navire sur une période donnée. L’index principal envisagé sur les tables temporelles suit donc cette logique :
`(vessel_id, timestamp)`

Si plusieurs sources doivent être distinguées dans les recherches ou au moment de l’enregistrement des données, `source_id` peut être ajouté :
`(vessel_id, timestamp, source_id)`

L’objectif est d’accélérer les recherches par navire et par période.
## 2. Choix de stockage

**PostgreSQL** constitue la base relationnelle du modèle : il permet de gérer les tables, les relations entre navires, sources et observations, ainsi que les contraintes d’intégrité.

Pour un historique beaucoup plus volumineux, **TimescaleDB** peut compléter PostgreSQL pour organiser les tables temporelles et faciliter leur partitionnement par temps.

Le principe retenu est donc :

Le prototype CSV reste adapté aux trois navires fournis, tandis que cette organisation répond au besoin d’un stockage persistant pour une flotte plus importante.

## 3. Météo mondiale

Les données météo doivent être stockées indépendamment des navires. Une même information environnementale peut concerner plusieurs navires présents dans la même zone ; elle ne doit donc pas être dupliquée pour chacun d’eux.

Le principe retenu est d’associer les données météo à une **position géographique et à un instant**.

### Grille géographique

Pour une source fournissant une grille régulière, le monde peut être découpé en cellules définies par :

- une origine géographique ;
- une résolution en latitude et longitude ;
- un nombre de lignes et de colonnes ;
- un identifiant de grille.

Une latitude et une longitude permettent alors de retrouver la cellule correspondante.

Les données météo d’une cellule peuvent contenir, selon le fournisseur, des mesures comme :

- le vent ;
- les vagues ;
- les courants ;
- d’autres variables environnementales disponibles dans le produit utilisé.

La recherche devient alors une recherche du type :
`cellule géographique + instant ou période`

Un index sur l’identifiant de cellule et le temps permettrait d’accélérer ce type d’accès.

### Temps météo

Les données météo conservent leurs propres timestamps. Pour une position du navire à un instant donné, la cellule météo correspondante est d’abord identifiée à partir de la latitude et de la longitude. FleetView utilise ensuite la dernière observation météo valide dont le timestamp est inférieur ou égal au timestamp de la position du navire.

### Évolution vers des données spatiales plus complexes
 Si les futures sources utilisent des zones irrégulières, des polygones ou des recherches de proximité plus complexes, **PostGIS** devient alors une extension pertinente pour les traitements spatiaux.