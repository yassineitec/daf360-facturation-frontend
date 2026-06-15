# Guide utilisateur — Module Gestion des coûts

**Application :** DAF360 Facturation  
**Module :** `/fact/cost`  
**Mise à jour :** Juin 2026

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Accès et permissions](#accès-et-permissions)
3. [Onglet 1 — Lignes de coût](#onglet-1--lignes-de-coût)
   - [Créer une ligne](#créer-une-ligne)
   - [Modifier une ligne](#modifier-une-ligne)
   - [Soumettre une ligne](#soumettre-une-ligne)
   - [Filtrer et paginer](#filtrer-et-paginer)
4. [Formulaire de ligne de coût](#formulaire-de-ligne-de-coût)
   - [Section 1 — Classification](#section-1--classification)
   - [Section 2 — Montant](#section-2--montant)
   - [Section 3 — Justificatif & options](#section-3--justificatif--options)
   - [Aperçu du niveau d'approbation](#aperçu-du-niveau-dapprobation)
5. [Onglet 2 — File d'approbation](#onglet-2--file-dapprobation)
   - [Approuver une ligne](#approuver-une-ligne)
   - [Retourner une ligne](#retourner-une-ligne)
   - [Rejeter une ligne](#rejeter-une-ligne)
   - [Approbation duale (L4)](#approbation-duale-l4)
6. [Onglet 3 — Configuration](#onglet-3--configuration)
   - [Seuils d'approbation](#seuils-dapprobation)
   - [Catégories de coût](#catégories-de-coût)
   - [Valeurs de liste](#valeurs-de-liste)
7. [Import CSV](#import-csv)
   - [Télécharger le modèle](#télécharger-le-modèle)
   - [Importer un fichier](#importer-un-fichier)
   - [Comprendre le rapport d'import](#comprendre-le-rapport-dimport)
8. [Statuts d'une ligne de coût](#statuts-dune-ligne-de-coût)
9. [Niveaux d'approbation](#niveaux-dapprobation)
10. [Questions fréquentes](#questions-fréquentes)

---

## Vue d'ensemble

Le module **Gestion des coûts** permet de saisir, suivre et approuver toutes les dépenses liées aux affaires : achats, prestations, loyers, frais divers, etc. Il est organisé en trois onglets :

| Onglet | Qui l'utilise | Pour quoi faire |
|--------|--------------|-----------------|
| **Lignes de coût** | Tous les collaborateurs habilités | Saisir, modifier et soumettre des dépenses |
| **File d'approbation** | Responsables financiers et directeurs | Approuver, retourner ou rejeter les dépenses soumises |
| **Configuration** | Administrateurs | Paramétrer les seuils, les catégories et les listes de valeurs |

---

## Accès et permissions

L'accès au module est conditionné par votre rôle dans l'application. Rapprochez-vous de votre administrateur si une fonctionnalité ne vous est pas accessible.

| Action | Permission requise |
|--------|--------------------|
| Voir les lignes de coût | Authentifié |
| Créer / modifier une ligne | Authentifié |
| Soumettre pour approbation | Authentifié |
| Approuver (L2) | `FACT_APPROVE_COST_L2` |
| Approuver (L3) | `FACT_APPROVE_COST_L3` |
| Approuver (L4) | `FACT_APPROVE_COST_L4` |
| Modifier les seuils | `FACT_ADMIN_COST` |
| Gérer les listes de valeurs | `FACT_ADMIN_COST` |

---

## Onglet 1 — Lignes de coût

### Créer une ligne

1. Cliquez sur le bouton **+ Nouvelle ligne** en haut à droite.
2. Le formulaire de saisie s'ouvre (voir [Formulaire de ligne de coût](#formulaire-de-ligne-de-coût)).
3. Renseignez tous les champs obligatoires (marqués d'un `*`).
4. Cliquez sur **Créer la ligne**.

La ligne est créée avec le statut **Brouillon**. Elle n'est pas encore visible par les approbateurs.

---

### Modifier une ligne

Seules les lignes en statut **Brouillon** ou **Retournée** peuvent être modifiées.

1. Dans le tableau, cliquez sur l'icône ✏ à droite de la ligne concernée.
2. Le formulaire s'ouvre en mode édition, pré-rempli avec les valeurs existantes.
3. Effectuez vos modifications et cliquez sur **Enregistrer**.

> **Remarque :** Les lignes en cours d'approbation (statut *Soumis*) ou déjà traitées ne peuvent pas être modifiées.

---

### Soumettre une ligne

Une fois la ligne prête, soumettez-la pour approbation :

1. Cliquez sur l'icône ▶ à droite de la ligne (visible uniquement pour les statuts *Brouillon* et *Retournée*).
2. Le système calcule automatiquement le niveau d'approbation requis en fonction du montant et de la catégorie.
3. Si le montant est en dessous du seuil L1, la ligne est **auto-approuvée immédiatement** — aucune action supplémentaire n'est nécessaire.
4. Sinon, la ligne passe au statut **Soumis** et apparaît dans la file d'approbation des responsables concernés.

---

### Filtrer et paginer

- Utilisez le menu déroulant **Tous les statuts** pour filtrer les lignes par statut.
- Le tableau affiche 25 lignes par page. Utilisez les boutons **‹** et **›** pour naviguer.

---

## Formulaire de ligne de coût

Le formulaire est divisé en trois sections.

---

### Section 1 — Classification

| Champ | Obligatoire | Description |
|-------|:-----------:|-------------|
| **Catégorie** | ✓ | Type de dépense. Seules les catégories à saisie manuelle sont affichées (les catégories automatiques comme les loyers ou les coûts de sous-traitance sont alimentées par d'autres modules). |
| **Date de transaction** | ✓ | Date à laquelle la dépense a eu lieu. La période comptable (mois/année) est calculée automatiquement. |
| **Période** | — | Calculée automatiquement à partir de la date de transaction. Non modifiable. |
| **Description** | ✓ | Libellé clair de la dépense (3 à 500 caractères). Ex : *Prestation topographie – Affaire AFF-2026-0042*. |
| **Type de coût** | — | Classification complémentaire (optionnel). Valeurs configurées par l'administrateur. |

> ⚠ **Catégorie n° 12 — Scrutin strict** : si vous sélectionnez une catégorie portant le numéro 12, un avertissement s'affiche. Le niveau d'approbation requis est automatiquement relevé d'un cran (ex : un montant normalement L2 passera en L3).

---

### Section 2 — Montant

| Champ | Obligatoire | Description |
|-------|:-----------:|-------------|
| **Montant HT** | ✓ | Montant hors taxes dans la devise locale. Doit être supérieur à 0. |
| **TVA** | — | Montant de la TVA (optionnel). |
| **Devise** | ✓ | Devise de la transaction. La liste est configurée par l'administrateur. La conversion en EUR est effectuée automatiquement pour les seuils d'approbation. |
| **Mode de paiement** | — | Ex : virement, chèque, carte (optionnel). |

---

### Section 3 — Justificatif & options

| Champ | Obligatoire | Description |
|-------|:-----------:|-------------|
| **Fournisseur** | — | Nom du fournisseur ou du prestataire (saisie libre). |
| **Référence document / URL** | — | Numéro de facture, bon de commande ou lien vers le document. |
| **Notes internes** | — | Informations complémentaires à l'usage de l'équipe. |
| **Dépense récurrente** | — | Cochez cette case si la dépense se répète régulièrement. |
| **Fréquence** | ✓ (si récurrente) | Fréquence de la récurrence (ex : mensuelle, trimestrielle). Obligatoire si la case *Dépense récurrente* est cochée. |

---

### Aperçu du niveau d'approbation

Pendant la saisie du montant, un **badge de prévisualisation** apparaît pour indiquer quel niveau d'approbation sera requis à la soumission. Ce calcul est basé sur les seuils configurés et tient compte de l'éventuel scrutin strict de la catégorie.

| Niveau | Couleur | Signification |
|--------|---------|---------------|
| **L1** | Gris | Auto-approuvé — aucune validation humaine nécessaire |
| **L2** | Bleu | Finance Manager |
| **L3** | Ambre | Country Director |
| **L4** | Rouge | Double approbation requise |

> Ce badge est indicatif. Le niveau final est calculé au moment de la soumission.

---

## Onglet 2 — File d'approbation

Cet onglet liste toutes les lignes de coût en attente d'approbation pour votre pays et votre niveau de permission.

Cliquez sur **↻ Actualiser** pour recharger la liste manuellement.

---

### Approuver une ligne

1. Identifiez la ligne concernée dans la liste.
2. Cliquez sur **Approuver**.
3. Une fenêtre s'ouvre affichant le détail de la ligne (description, montant, niveau requis).
4. Saisissez un commentaire si nécessaire (optionnel pour l'approbation).
5. Cliquez sur **Approuver** pour confirmer.

La ligne passe au statut **Approuvé** (ou reste *Soumis* dans le cas d'une approbation duale — voir ci-dessous).

---

### Retourner une ligne

Retourner une ligne la renvoie au créateur pour correction, sans la rejeter définitivement.

1. Cliquez sur **Retourner**.
2. Saisissez un **motif obligatoire** dans le champ commentaire.
3. Cliquez sur **Retourner** pour confirmer.

La ligne repasse au statut **Retournée** et peut être modifiée puis re-soumise par son créateur.

---

### Rejeter une ligne

Rejeter une ligne met fin définitivement au processus pour ce montant.

1. Cliquez sur **Rejeter**.
2. Saisissez un **motif obligatoire** dans le champ commentaire.
3. Cliquez sur **Rejeter** pour confirmer.

La ligne repasse au statut **Rejetée**.

> ⚠ **Attention :** le rejet est irréversible. Si la dépense doit malgré tout être saisie, il faudra créer une nouvelle ligne.

---

### Approbation duale (L4)

Pour les montants très élevés (niveau L4), **deux approbateurs distincts** doivent valider la ligne.

- Lors de la première approbation, un avertissement s'affiche : *"Approbation duale (L4) — un second approbateur sera nécessaire pour finaliser."*
- La ligne reste au statut **Soumis** après la première approbation.
- Un second approbateur (différent du premier) doit également approuver pour que la ligne passe au statut **Approuvé**.
- Un même approbateur ne peut pas approuver la même ligne deux fois.

---

## Onglet 3 — Configuration

Cet onglet est réservé aux utilisateurs disposant de la permission `FACT_ADMIN_COST`.

---

### Seuils d'approbation

Les seuils définissent les montants en EUR à partir desquels chaque niveau d'approbation est déclenché.

**Pour modifier un seuil :**

1. Cliquez sur l'icône ✏ à droite du seuil à modifier.
2. La ligne passe en mode édition. Modifiez les champs :
   - **Rôle approbateur** : code du rôle interne qui reçoit les notifications.
   - **Min EUR** : montant minimal (inclus) pour ce niveau.
   - **Max EUR** : montant maximal (exclu). Laissez vide pour "infini" (seuil L4).
3. Cliquez sur **✓** pour enregistrer, ou **✕** pour annuler.

> **Important :** les seuils doivent être contigus et non chevauchants. Une incohérence dans la configuration peut entraîner des lignes sans niveau d'approbation assigné.

---

### Catégories de coût

Cette section affiche la liste complète des catégories disponibles, à titre informatif. Les catégories ne sont pas modifiables depuis cette interface — elles sont gérées directement en base de données.

Colonnes affichées :
- **#** : numéro de catégorie (détermine le comportement automatique)
- **Code** : identifiant technique
- **Libellé** : nom de la catégorie
- **CapEx** : indique si la dépense est capitalisable
- **Direct** : indique si la dépense est directement liée à une affaire
- **Statut** : Actif / Inactif

---

### Valeurs de liste

Cette section permet de gérer les valeurs proposées dans les menus déroulants du formulaire de saisie. Quatre listes sont disponibles via les onglets :

| Onglet | Champ concerné dans le formulaire |
|--------|----------------------------------|
| **Devises** | Menu *Devise* |
| **Types de coût** | Menu *Type de coût* |
| **Modes de paiement** | Menu *Mode de paiement* |
| **Fréquences** | Menu *Fréquence* (dépenses récurrentes) |

**Ajouter une valeur :**

1. Sélectionnez l'onglet de la liste concernée.
2. Remplissez la ligne de saisie en bas du tableau :
   - **Code** : identifiant unique (ex : `EUR`, `MENSUEL`). Obligatoire.
   - **Libellé FR** : nom affiché en français. Obligatoire.
   - **Libellé EN** : traduction anglaise. Optionnel.
   - **Défaut** : cochez pour que cette valeur soit pré-sélectionnée dans les formulaires.
3. Cliquez sur **+** pour enregistrer.

**Désactiver une valeur :**

Cliquez sur **✕** à droite de la valeur. Une confirmation est demandée. La valeur est désactivée et disparaît des menus déroulants des nouveaux formulaires.

> **Remarque :** les valeurs déjà utilisées sur des lignes de coût existantes ne sont pas supprimées — elles sont simplement masquées pour les nouvelles saisies.

---

## Import CSV

Le panneau d'import CSV se trouve dans l'onglet **Configuration**, à droite de l'écran.

Il permet d'importer en lot un grand nombre de lignes de coût depuis un fichier tableur.

---

### Télécharger le modèle

Cliquez sur **⬇ Télécharger le modèle** pour obtenir un fichier `modele-import-couts.csv` contenant les colonnes attendues et une ligne d'exemple.

| Colonne | Type | Description |
|---------|------|-------------|
| `date` | AAAA-MM-JJ | Date de transaction |
| `category_number` | Entier | Numéro de la catégorie (ex : 1, 5, 9) |
| `description` | Texte | Libellé de la dépense (obligatoire) |
| `amount` | Décimal | Montant HT (ex : 3500.000) |
| `currency_code` | Texte | Code devise ISO 4217 (ex : EUR, TND, DZD) |
| `vat_amount` | Décimal | Montant TVA (0 si exempt) |
| `notes` | Texte | Notes internes (optionnel) |
| `supplier` | Texte | Nom du fournisseur (optionnel) |
| `document_ref` | Texte | Référence document (optionnel) |

---

### Importer un fichier

1. **Glissez** votre fichier CSV dans la zone prévue, ou cliquez sur **Parcourir** pour le sélectionner.
2. Le nom et la taille du fichier s'affichent pour confirmation.
3. Cliquez sur **Importer** pour lancer le traitement.
4. Patientez pendant le chargement (une animation indique que l'import est en cours).

> **Format accepté :** fichiers `.csv` uniquement.

---

### Comprendre le rapport d'import

Une fois l'import terminé, un rapport s'affiche :

| Indicateur | Signification |
|------------|---------------|
| **Importées** | Nombre de lignes créées avec succès |
| **Erreurs** | Nombre de lignes rejetées |
| **Total lignes** | Nombre total de lignes traitées dans le fichier |

Si des erreurs sont présentes, leur détail s'affiche en dessous : numéro de ligne dans le fichier CSV et message d'erreur explicatif.

**Causes d'erreur fréquentes :**
- Numéro de catégorie invalide ou appartenant à une catégorie automatique
- Code devise inconnu ou non configuré pour votre pays
- Montant négatif ou nul
- Date mal formatée (utiliser le format `AAAA-MM-JJ`)
- Description manquante

Cliquez sur **Nouvel import** pour recommencer avec un autre fichier.

---

## Statuts d'une ligne de coût

| Statut | Description | Actions disponibles |
|--------|-------------|---------------------|
| **Brouillon** | Ligne créée, non soumise | Modifier, Soumettre |
| **Soumis** | En attente d'approbation | — (côté saisie) |
| **Retournée** | Renvoyée pour correction | Modifier, Re-soumettre |
| **Approuvé** | Validé par l'approbateur | — |
| **Validé** | Validation comptable finale | — |
| **Comptabilisé** | Enregistré en comptabilité | — |
| **Annulé** | Annulé manuellement | — |
| **Rejeté** | Refusé définitivement | — |

---

## Niveaux d'approbation

Les niveaux sont déterminés automatiquement par le système selon le montant converti en EUR et la catégorie sélectionnée.

| Niveau | Approbateur | Particularité |
|--------|-------------|---------------|
| **L1** | *Aucun* | Auto-approuvé instantanément à la soumission |
| **L2** | Finance Manager | Approbation simple |
| **L3** | Country Director | Approbation simple |
| **L4** | Direction générale | **Double approbation** : deux personnes distinctes doivent approuver |

> La catégorie n° 12 (scrutin strict) décale le niveau d'un cran vers le haut (L1→L2, L2→L3, L3→L4).

Les seuils en euros sont configurables dans l'onglet **Configuration → Seuils d'approbation**.

---

## Questions fréquentes

**Q : Je ne vois pas la catégorie dont j'ai besoin dans le formulaire.**  
R : Seules les catégories à saisie manuelle sont disponibles dans le formulaire. Les catégories automatiques (loyers, coûts de sous-traitance, etc.) sont alimentées par d'autres modules. Si une catégorie est manquante, contactez votre administrateur.

---

**Q : Mon menu Devise est vide.**  
R : Les devises disponibles doivent être configurées par un administrateur dans l'onglet **Configuration → Valeurs de liste → Devises**. Un avertissement est affiché dans le formulaire si aucune devise n'est disponible.

---

**Q : J'ai soumis une ligne mais elle n'apparaît pas dans la file d'approbation de mon responsable.**  
R : Vérifiez que votre responsable dispose bien de la permission correspondant au niveau d'approbation calculé (`FACT_APPROVE_COST_L2`, `L3` ou `L4`). Si le niveau calculé est L1, la ligne est auto-approuvée et n'apparaît dans aucune file.

---

**Q : Mon montant est saisi en TND mais le système indique un niveau L3. Pourquoi ?**  
R : Le niveau d'approbation est calculé sur le **montant converti en EUR**, et non sur le montant dans la devise locale. Les taux de conversion sont configurés dans les paramètres système. Si le taux vous semble incorrect, contactez votre administrateur.

---

**Q : Puis-je modifier une ligne déjà soumise ?**  
R : Non. Seules les lignes en statut *Brouillon* ou *Retournée* peuvent être modifiées. Pour corriger une ligne soumise, demandez à l'approbateur de la **Retourner** avec un commentaire. Elle repassera alors en statut *Retournée* et sera à nouveau éditable.

---

**Q : L'import CSV a créé des doublons.**  
R : Le système n'effectue pas de détection automatique de doublons lors de l'import. Vérifiez vos fichiers CSV avant l'import pour éviter les lignes en double. En cas de doublon, les lignes importées par erreur devront être annulées manuellement.

---

*Pour toute question non couverte par ce guide, contactez le support DAF360 ou votre administrateur système.*
