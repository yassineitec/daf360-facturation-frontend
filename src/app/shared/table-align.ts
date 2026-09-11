import type { TableColumn } from '@khalilrebhiitec/daf360';

/**
 * Centre toutes les colonnes d'un tableau du module finance.
 *
 * <h2>Pourquoi un utilitaire plutôt qu'un `align` sur chaque colonne</h2>
 * Le module compte une trentaine de tableaux et plus de trois cents définitions de
 * colonnes. Les annoter une par une, c'était trois cents occasions d'en oublier une — et
 * la première colonne oubliée rouvre exactement la dérive que la maison a passé des mois
 * à refermer (UI-PLAYBOOK §6b : « 39 tableaux qui se ressemblent tous de loin »). Ici, la
 * règle vit à un seul endroit : on la change ou on la retire d'un seul geste.
 *
 * <h2>Ce que la lib centre, et ce qu'elle ne centre pas</h2>
 * `daf-data-table` applique `align` en `text-align` sur le `<th>` et le `<td>`. Cela
 * suffit pour le texte, les nombres et les badges, qui sont du contenu en ligne. Cela ne
 * suffit **pas** pour :
 *
 * - les colonnes `type: 'avatar'`, dont la lib rend elle-même un
 *   `<div class="flex items-center gap-2.5">` : un conteneur flex de niveau bloc que
 *   `text-align` ne déplace pas. Rien côté application ne peut l'atteindre — il faudrait
 *   que la lib ajoute `justify-center` quand la colonne est centrée ;
 * - les gabarits projetés (`dafCell`), dont la mise en page appartient à l'appelant :
 *   un `flex flex-col` reste collé à gauche, un `items-end` reste à droite. Ceux du
 *   module ont été repris pour centrer leur contenu.
 *
 * Autrement dit : ceci centre tout ce qui peut l'être depuis l'application. Les colonnes
 * d'identité restent alignées à gauche tant que la lib n'expose pas de prise.
 *
 * <h2>Note de lisibilité, assumée</h2>
 * Centrer des montants casse l'alignement des unités et des séparateurs de milliers, qui
 * est ce qui permet de comparer une colonne de chiffres d'un coup d'œil. C'est un choix
 * produit explicite, pas un oubli : d'où cet utilitaire unique, qui rend le retour en
 * arrière trivial si la lecture des tableaux financiers en pâtit.
 *
 * ```ts
 * protected readonly columns = computed<TableColumn[]>(() => centered([
 *   { key: 'client', label: t('…'), type: 'avatar' },
 *   { key: 'amount', label: t('…'), type: 'text'   },
 * ]));
 * ```
 */
export function centered(columns: TableColumn[]): TableColumn[] {
  return columns.map(col => ({ ...col, align: 'right' as const }));
}
