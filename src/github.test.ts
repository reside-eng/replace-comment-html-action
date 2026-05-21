import { beforeEach, describe, expect, it, vi } from 'vitest';

const warning = vi.fn();

vi.mock('@actions/core', () => ({
  getInput: (name: string) => {
    if (name === 'token') return 'gh_test_token';
    if (name === 'repository') return 'reside-eng/replace-comment-html-action';
    if (name === 'issue-number') return '123';
    return '';
  },
  debug: vi.fn(),
  info: vi.fn(),
  warning,
  setOutput: vi.fn(),
}));

const paginate = vi.fn();
const updateComment = vi.fn();
const createComment = vi.fn();

vi.mock('@actions/github', () => ({
  getOctokit: () => ({
    paginate,
    rest: {
      issues: {
        listComments: vi.fn(),
        updateComment,
        createComment,
      },
    },
  }),
}));

const github = await import('./github.js');

describe('findExistingComment', () => {
  beforeEach(() => {
    paginate.mockReset();
  });

  it('returns null when no comment matches the selector', async () => {
    paginate.mockResolvedValue([]);

    const result = await github.findExistingComment('#missing');

    expect(result).toBeNull();
  });

  it('returns the single matching comment', async () => {
    const comment = {
      id: 7,
      body: '<div id="hit">found</div>',
    };
    paginate.mockResolvedValue([comment]);

    const result = await github.findExistingComment('#hit');

    expect(result).toEqual(comment);
  });

  it('warns when multiple comments match (pagination edge case)', async () => {
    warning.mockClear();
    paginate.mockResolvedValue([
      { id: 1, body: '<div id="dup">a</div>' },
      { id: 2, body: '<div id="dup">b</div>' },
    ]);

    await github.findExistingComment('#dup');

    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Found 2 comments'),
    );
  });
});

describe('updateComment', () => {
  beforeEach(() => {
    updateComment.mockReset();
  });

  it('calls octokit updateComment with the right params', async () => {
    updateComment.mockResolvedValue({ data: { id: 42 } });

    await github.updateComment(42, '<p>new body</p>');

    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '<p>new body</p>',
        comment_id: 42,
        owner: 'reside-eng',
        repo: 'replace-comment-html-action',
      }),
    );
  });
});

describe('createComment', () => {
  beforeEach(() => {
    createComment.mockReset();
  });

  it('calls octokit createComment with the right params', async () => {
    createComment.mockResolvedValue({ data: { id: 99 } });

    await github.createComment('<p>hello</p>');

    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '<p>hello</p>',
        issue_number: 123,
        owner: 'reside-eng',
        repo: 'replace-comment-html-action',
      }),
    );
  });
});
