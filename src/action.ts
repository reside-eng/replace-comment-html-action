import * as cheerio from 'cheerio';
import * as core from '@actions/core';
import { createComment, findExistingComment, updateComment } from './github.js';

const Mode = {
  Upsert: 'upsert',
  CreateOnly: 'create-only',
};

/**
 * Reorder and group tbody rows by environment and service name
 * @param $ - Cheerio instance
 * @param $tbody - Tbody element containing rows to reorder
 */
function reorderTableRows(
  $: cheerio.CheerioAPI,
  $tbody: cheerio.Cheerio<cheerio.AnyNode>,
) {
  const $rows = $tbody.find('tr');

  core.debug(`Starting table reordering - found ${$rows.length} rows`);

  if ($rows.length > 0) {
    // Extract environment and service from each row's id
    interface RowData {
      element: cheerio.Cheerio<cheerio.Element>;
      environment: string;
      serviceName: string;
    }

    const rowsData: RowData[] = [];
    $rows.each((_, row) => {
      const $row = $(row);
      const id = $row.attr('id');

      if (id && id.startsWith('preview-link-')) {
        // Parse id format: preview-link-<environment>-<service-name>
        const parts = id.replace('preview-link-', '').split('-');
        if (parts.length >= 2) {
          const environment = parts[0];
          const serviceName = parts.slice(1).join('-');
          rowsData.push({ element: $row, environment, serviceName });
          core.debug(
            `Parsed row: env="${environment}", service="${serviceName}"`,
          );
        }
      }
    });

    core.debug(`Parsed ${rowsData.length} valid rows`);

    // Sort by environment first, then by service name
    rowsData.sort((a, b) => {
      if (a.environment !== b.environment) {
        return a.environment.localeCompare(b.environment);
      }
      return a.serviceName.localeCompare(b.serviceName);
    });

    // Group by environment
    const groupedByEnv = new Map<string, RowData[]>();
    for (const rowData of rowsData) {
      if (!groupedByEnv.has(rowData.environment)) {
        groupedByEnv.set(rowData.environment, []);
      }
      groupedByEnv.get(rowData.environment)!.push(rowData);
    }

    core.debug(`Grouped into ${groupedByEnv.size} environments`);

    // Clear tbody and rebuild with sorted rows
    $tbody.empty();

    for (const [environment, rows] of Array.from(groupedByEnv.entries())) {
      const rowCount = rows.length;
      const serviceNames = rows.map((r) => r.serviceName).join(', ');
      core.debug(
        `Environment "${environment}": ${rowCount} services [${serviceNames}]`,
      );

      rows.forEach((rowData, index) => {
        const $row = rowData.element;
        const $firstTd = $row.find('td').first();

        if (index === 0) {
          // First row of the group: modify the first td to show only environment with rowspan
          // and add a new td for service name
          if ($firstTd.attr('rowspan')) {
            // Environment td already exists in this row, update it
            $firstTd.attr('rowspan', rowCount.toString());
          } else {
            // Environment td doesn't exist in this row, add it
            $row.prepend(
              `<td rowspan="${rowCount}">\n    ${environment}\n  </td>`,
            );
          }

          // Insert service name td after environment td
          // $firstTd.after(`<td>\n    ${rowData.serviceName}\n  </td>`);
          // core.debug(`First row of ${environment}: added rowspan=${rowCount}`);
        } else if ($firstTd.attr('rowspan')) {
          // For subsequent rows: if the first td contains a rowspan (env element), remove it
          $firstTd.remove();
        }

        // Append the row to tbody
        $tbody.append($row);
      });
    }

    core.debug(`Reordered ${rowsData.length} rows`);
    core.debug(`New tbody: ${$tbody.html()}`);

    core.debug('Table reordering completed');
  } else {
    core.debug('No rows found to reorder');
  }
}

/**
 * Handle updating/creating an element that is dependent on the presence
 * of a parent element.
 * @param params - Params object
 * @param params.mode - Mode
 * @param params.html - HTML content
 * @param params.selector - Selector
 * @param params.parentSelector - Parent selector
 * @returns Promise which resolves after updating element
 */
async function handleDependentElement(params: {
  mode: string;
  html: string;
  selector: string;
  parentSelector: string;
}) {
  const { mode, html, selector, parentSelector } = params;
  core.debug('Dependent element');

  const comment = await findExistingComment(parentSelector);

  if (!comment) {
    throw new Error(
      `Could not find comment using parent selector: ${parentSelector}.`,
    );
  }

  if (!comment.body) {
    // Note: This should never happen
    throw new Error(`Could not find body in comment: ${comment.id}`);
  }

  const $ = cheerio.load(comment.body, null, false);
  const $parent = $(parentSelector);
  const $element = $parent.find(selector);

  switch (mode) {
    case Mode.CreateOnly: {
      if ($element.length === 0) {
        core.info(
          `Element does not exist, creating and appending to parent "${parentSelector}"...`,
        );
        $parent.append(html);
      } else {
        core.info(
          `Existing element at selector "${selector}" will not be updated – mode is ${Mode.CreateOnly}`,
        );
      }
      break;
    }
    case Mode.Upsert: {
      if ($element.length > 0) {
        core.info(
          `Existing element found at selector "${selector}", updating...`,
        );
        $element.replaceWith(html);
      } else {
        core.info(
          `Element does not exist, creating and appending to parent "${parentSelector}"...`,
        );
        $parent.append(html);
      }
      break;
    }
    default: {
      throw new Error(`Invalid mode: ${mode}`);
    }
  }

  core.debug(`Parent: ${$parent}`);
  core.debug(`ParentSelector: ${parentSelector}`);

  // Reorder and group table rows by environment and service name
  reorderTableRows($, $parent);

  await updateComment(comment.id, $.html());
}

/**
 * Handle updating/creating an element that is not dependent on a parent
 * element.
 * @param params - Params object
 * @param params.mode - Mode
 * @param params.html - HTML content
 * @param params.selector - Selector
 */
async function handleIndependentElement(params: {
  mode: string;
  html: string;
  selector: string;
}) {
  const { mode, html, selector } = params;

  core.debug('Independent element');

  const comment = await findExistingComment(selector);

  // New comment
  if (!comment) {
    const $ = cheerio.load(html, null, false);
    const body = $.html();
    await createComment(body);
    return;
  }

  if (!comment.body) {
    // Note: This should never happen
    throw new Error(`Could not find body in comment: ${comment.id}`);
  }

  switch (mode) {
    case Mode.Upsert: {
      const $ = cheerio.load(comment.body, null, false);
      const $element = $(selector);
      if ($element.length > 0) {
        core.info(
          `Existing element found at selector "${selector}", updating...`,
        );
        $element.replaceWith(html);
      } else {
        core.info(
          'Element does not exist, creating and appending to comment root...',
        );
        $.root().append(html);
      }

      // Reorder and group table rows by environment and service name
      const $table = $(selector);
      const $tbody = $table.find('tbody');
      core.debug(`Tbody: ${$tbody}`);
      core.debug(`Tbody length: ${$tbody.length}`);
      if ($tbody.length > 0) {
        reorderTableRows($, $tbody);
      }

      await updateComment(comment.id, $.html());
      break;
    }
    case Mode.CreateOnly: {
      core.setOutput('comment-id', comment.id);
      core.info(
        `Existing element ${selector} will not be updated since mode is ${Mode.CreateOnly}`,
      );
      break;
    }
    default: {
      throw new Error(`Invalid mode: ${mode}`);
    }
  }
}

/**
 *
 * @param params - Params object
 * @param params.mode - Mode
 * @param params.html - HTML content
 * @param params.selector - Selector
 * @param params.parentSelector - Parent selector
 * @returns Promise which resolves after updating element
 */
export async function action(params: {
  mode: string;
  html: string;
  selector: string;
  parentSelector: string | null;
}) {
  const { mode, html, selector, parentSelector } = params;

  if (parentSelector) {
    return handleDependentElement({
      mode,
      html,
      selector,
      parentSelector,
    });
  }

  return handleIndependentElement({
    mode,
    html,
    selector,
  });
}
