# Pôle Pédagogique — site de suivi des apprenants

Application de suivi en temps réel pour le pôle pédagogique : gestion des apprenants, suivi pédagogique (évaluations), feuille de présence avec calcul automatique des jours/heures, et gestion des accès (admin / éditeur / lecteur). Fonctionne sur ordinateur et sur téléphone.

Ce guide est écrit pour une mise en place **sans connaissances techniques**. Comptez environ 30 à 45 minutes la première fois. Les captures d'écran de Supabase/Vercel peuvent légèrement changer d'un mois à l'autre, mais les noms de menus ci-dessous restent fiables.

---

## Vue d'ensemble de ce qui va être mis en place

1. **Supabase** (gratuit) : la base de données + les comptes utilisateurs + l'envoi des e-mails.
2. **Vercel** (gratuit) : l'hébergement du site (l'adresse que tout le monde ouvrira).
3. **Clara** : premier compte, créé en administratrice. Elle pourra ensuite inviter elle-même tous les autres membres depuis le site (page « Équipe »).

---

## Étape 1 — Créer le projet Supabase

1. Aller sur https://supabase.com et créer un compte (gratuit).
2. Cliquer sur **New project**.
   - Nom : `pole-pedagogique`
   - Mot de passe de base de données : générez-en un et **conservez-le** dans un endroit sûr (gestionnaire de mots de passe).
   - Région : choisissez une région proche (ex. Europe).
3. Attendre 1 à 2 minutes que le projet soit prêt.
4. Dans le menu de gauche, aller dans **Project Settings > API**. Noter deux valeurs (vous en aurez besoin à l'étape 4) :
   - `Project URL`
   - `anon public` key

## Étape 2 — Créer les tables (base de données)

1. Dans le menu de gauche, ouvrir **SQL Editor**.
2. Cliquer sur **New query**.
3. Ouvrir le fichier `supabase/migrations/0001_init.sql` fourni dans ce projet, copier tout son contenu, le coller dans l'éditeur SQL.
4. Cliquer sur **Run**. Vous devez voir « Success. No rows returned ».

Cela crée : les apprenants, les évaluations (suivi pédagogique), les présences, le calcul automatique des totaux, et les règles de sécurité (qui a le droit de voir/modifier quoi selon le rôle).

## Étape 2 bis — Ajouter les fonctionnalités complémentaires

1. Toujours dans **SQL Editor**, nouvelle requête : copier-coller le contenu de `supabase/migrations/0002_ajouts.sql`, puis **Run**.
   Cela ajoute : les groupes structurés, les alertes d'assiduité, le journal de suivi, les pièces jointes (avec leur espace de stockage, créé automatiquement), les attestations et l'historique des modifications.
2. Une fois le compte de Clara créé (étape 5), exécuter aussi :
   ```sql
   update public.profiles set is_owner = true where email = 'c.galanis@arcs-france.fr';
   ```
   Cela lui donne accès à la page **Historique**, qui reste invisible pour tous les autres comptes (y compris les autres administrateurs).

## Étape 2 ter — Ajouts v3 (pôle administratif, dossiers, corbeille)

Dans **SQL Editor**, nouvelle requête : copier-coller le contenu de `supabase/migrations/0003_ajouts2.sql`, puis **Run**.

Cela ajoute : le rôle « Pôle administratif » (consultation de tout le site, modification limitée à l'onglet Dossiers administratifs), les nouveaux champs de la fiche apprenant (dates, financement, CECRL initial/visé, contact, heures totales à faire), la corbeille (suppression réversible pendant 15 jours) et l'onglet Dossiers administratifs.

## Étape 2 quater — Ajouts v4 (PDF sur les dossiers administratifs)

Dans **SQL Editor**, nouvelle requête : copier-coller le contenu de `supabase/migrations/0004_ajouts3.sql`, puis **Run**.

Cela ajoute la possibilité de joindre un PDF à chaque document suivi dans l'onglet Dossiers administratifs (bucket de stockage dédié, créé automatiquement).

## Étape 3 — Configurer l'authentification

1. Menu **Authentication > Providers** : vérifier que **Email** est activé (c'est le cas par défaut).
2. Menu **Authentication > Sign In / Providers > Email** (ou **Auth Settings** selon la version) : désactiver l'option d'**inscription libre** (« Allow new users to sign up ») si elle est proposée — dans cette application, seuls les administrateurs créent des comptes via invitation, il n'y a pas de page d'inscription publique.
3. Menu **Authentication > URL Configuration** :
   - **Site URL** : à renseigner à l'étape 6 une fois le site déployé (temporairement, laissez `http://localhost:5173`).
   - **Redirect URLs** : ajoutez `http://localhost:5173/definir-mot-de-passe` (et vous ajouterez l'adresse définitive à l'étape 6).

## Étape 4 — Déployer la fonction d'invitation (Edge Function)

Cette petite fonction est ce qui permet à Clara d'inviter quelqu'un par e-mail depuis le site.

1. Installer les outils nécessaires une seule fois sur un ordinateur (Terminal / Invite de commandes) :
   ```
   npm install -g supabase
   ```
2. Depuis le dossier du projet (`pole-pedagogique`), se connecter :
   ```
   supabase login
   ```
   (Une page internet s'ouvre pour valider la connexion.)
3. Relier le projet local au projet Supabase créé à l'étape 1 :
   ```
   supabase link --project-ref VOTRE_REF_DE_PROJET
   ```
   La référence du projet se trouve dans **Project Settings > General > Reference ID**.
4. Déployer la fonction :
   ```
   supabase functions deploy invite-user
   ```
5. Une fois le site déployé (étape 6), définir l'adresse du site pour que les e-mails d'invitation pointent au bon endroit :
   ```
   supabase secrets set SITE_URL=https://votre-site.vercel.app
   ```

> Si personne dans l'équipe n'est à l'aise avec ces commandes, n'importe quel prestataire technique peut effectuer cette étape 4 en 5 minutes à partir des fichiers fournis — c'est la seule étape qui nécessite un terminal.

## Étape 5 — Créer le premier compte : Clara Galanis (administratrice)

1. Dans Supabase, menu **Authentication > Users**.
2. Cliquer sur **Add user > Invite user** (ou **Invite**).
3. Renseigner l'adresse : `c.galanis@arcs-france.fr`.
4. Clara reçoit un e-mail « You have been invited » : elle clique sur le lien et choisit son mot de passe. Son compte est alors validé.
5. Retourner dans **SQL Editor**, nouvelle requête, coller puis exécuter :
   ```sql
   update public.profiles
   set role = 'admin', nom = 'Galanis', prenom = 'Clara'
   where email = 'c.galanis@arcs-france.fr';
   ```
   Cela fait de Clara l'administratrice du site. Elle pourra ensuite inviter tout le monde elle-même depuis la page **Équipe** du site (plus besoin de repasser par Supabase).

## Étape 6 — Déployer le site (Vercel)

1. Mettre le code du projet sur GitHub (créer un dépôt et y déposer le contenu du dossier `pole-pedagogique`, soit avec `git`, soit via l'ajout de fichiers sur github.com).
2. Aller sur https://vercel.com, créer un compte, cliquer sur **Add New > Project**, choisir le dépôt GitHub créé.
3. Dans **Environment Variables**, ajouter :
   - `VITE_SUPABASE_URL` = Project URL notée à l'étape 1
   - `VITE_SUPABASE_ANON_KEY` = clé `anon public` notée à l'étape 1
4. Cliquer sur **Deploy**. Après 1 à 2 minutes, une adresse est générée, par exemple `https://pole-pedagogique.vercel.app`.
5. Retourner dans Supabase, **Authentication > URL Configuration**, et remplacer :
   - **Site URL** par `https://pole-pedagogique.vercel.app`
   - **Redirect URLs** : ajouter `https://pole-pedagogique.vercel.app/definir-mot-de-passe`
6. Mettre à jour le secret de la fonction (voir fin de l'étape 4) avec la même adresse.

Le site est maintenant en ligne, accessible depuis un ordinateur ou un téléphone à l'adresse Vercel.

---

## Utilisation au quotidien

- **Connexion** : chacun se connecte avec son e-mail et son mot de passe. La session reste active automatiquement (pas besoin de se reconnecter à chaque visite), sur ordinateur comme sur téléphone.
- **Ajout de membres** : Clara va dans **Équipe**, renseigne prénom / nom / e-mail / rôle, et clique sur « Envoyer l'invitation ». La personne reçoit un e-mail pour définir son mot de passe : c'est cette étape qui valide son compte.
- **Rôles** :
  - *Administrateur* : accès complet, gère l'équipe et les rôles.
  - *Éditeur* : peut ajouter/modifier apprenants, évaluations, présences.
  - *Lecteur* : consultation uniquement.
- **Enregistrement automatique** : toutes les saisies (apprenants, évaluations, présences) sont enregistrées automatiquement dès qu'on quitte un champ — aucun bouton « Enregistrer » à chercher. Un petit ✓ confirme l'enregistrement.
- **Temps réel** : si deux personnes utilisent le site en même temps, les nouvelles lignes et les mises à jour apparaissent automatiquement chez tout le monde.
- **Calcul des heures/jours** : dans l'onglet **Présences**, le tableau du bas calcule automatiquement, pour chaque apprenant, le nombre total de jours de présence et d'heures cumulées, à partir des présences saisies au jour le jour.
- **Groupes** : onglet dédié pour créer des groupes (nom, dates de session, formateur par défaut optionnel). Dans la fiche d'un apprenant, le formateur peut toujours être changé ou retiré individuellement, même si son groupe a un formateur par défaut.
- **Fiche apprenant** (cliquer sur un nom dans la liste **Apprenants**) : regroupe les totaux de présence, les exports, les pièces jointes et le journal de suivi de cet apprenant.
- **Exports** (depuis la fiche apprenant) : relevé de présence (Excel ou PDF) et bilan pédagogique (PDF), générés en un clic.
- **Attestation de présence/heures** : bouton réservé aux administrateurs, généré uniquement à la demande — jamais automatiquement, sans signature de l'apprenant.
- **Pièces jointes** : entièrement optionnelles ; un document n'est ajouté à une fiche apprenant que si quelqu'un choisit de le faire.
- **Alertes** (tableau de bord) : liste des apprenants dépassant un seuil d'absences (modifiable par un admin) et des évaluations prévues non réalisées à temps.
- **Calendrier** : vue mensuelle des évaluations prévues, avec code couleur par statut.
- **Journal de suivi** : onglet séparé pour des notes internes par apprenant, indépendantes des évaluations.
- **Statistiques** : taux de réussite, niveau CECRL moyen et heures moyennes, par groupe et par formateur.
- **Historique** : liste complète des créations/modifications/suppressions, visible uniquement par la personne désignée comme « propriétaire » (Clara) — même les autres administrateurs n'y ont pas accès.
- **Pôle administratif** (nouveau rôle) : consulte l'intégralité du site (comme un lecteur), mais ne peut modifier que l'onglet **Dossiers administratifs**.
- **Dossiers administratifs** : pour chaque apprenant, une liste de documents à suivre choisis dans une liste déroulante (avec option "+ Nouveau document..." pour en créer un), statut manquant / reçu / à mettre à jour, et possibilité de joindre le PDF correspondant à chaque document. La date de naissance est affichée à côté du nom pour distinguer les homonymes. Visible par tous, modifiable par les administrateurs et le pôle administratif.
- **Corbeille** : supprimer un apprenant ou un groupe ne l'efface pas tout de suite — il reste 15 jours dans la Corbeille (menu admin), avec un bouton pour le restaurer ou le supprimer définitivement avant l'échéance.
- **Filtre par groupe** : sur la page Apprenants et sur la feuille de présence, un menu déroulant permet de filtrer par groupe (mois/année).
- **Heures totales et heures restantes** : en créant ou modifiant un apprenant, vous pouvez indiquer le nombre d'heures total qu'il doit faire ; le site calcule automatiquement combien il lui reste, à partir des présences enregistrées.
- **Calendrier enrichi** : affiche aussi les séances de cours (jours où une présence a été enregistrée) ; cliquer sur un jour montre qui était présent, absent ou en retard ce jour-là.

## À propos de la limite gratuite Supabase

Le plan gratuit Supabase met un projet en pause s'il n'y a **aucune activité pendant 7 jours consécutifs sur l'ensemble du projet** (et non par utilisateur). Avec 14-15 personnes utilisant le site quotidiennement, ce cas ne devrait jamais se produire. Si cela arrivait malgré tout (ex. vacances collectives), aucune donnée n'est perdue : il suffit de rouvrir le tableau de bord Supabase et de cliquer sur **Restore/Resume project** pour tout réactiver.

## Support

- Fichier SQL : `supabase/migrations/0001_init.sql`
- Fonction d'invitation : `supabase/functions/invite-user`
- Code du site : dossier `src/`
