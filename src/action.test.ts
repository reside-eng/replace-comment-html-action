import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./github.js', () => ({
  findExistingComment: vi.fn(),
  updateComment: vi.fn(),
  createComment: vi.fn(),
}));

const githubMock = await import('./github.js');
const { action } = await import('./action.js');

describe('action()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('independent element (no parentSelector)', () => {
    it('creates a new comment when none exists', async () => {
      vi.mocked(githubMock.findExistingComment).mockResolvedValue(null);

      await action({
        mode: 'upsert',
        html: '<div id="status">ok</div>',
        selector: '#status',
        parentSelector: null,
      });

      expect(githubMock.createComment).toHaveBeenCalledTimes(1);
      expect(githubMock.createComment).toHaveBeenCalledWith(
        expect.stringContaining('<div id="status">ok</div>'),
      );
      expect(githubMock.updateComment).not.toHaveBeenCalled();
    });

    it('updates an existing comment on upsert when element is present', async () => {
      vi.mocked(githubMock.findExistingComment).mockResolvedValue({
        id: 42,
        body: '<div id="status">stale</div>',
      } as never);

      await action({
        mode: 'upsert',
        html: '<div id="status">fresh</div>',
        selector: '#status',
        parentSelector: null,
      });

      expect(githubMock.updateComment).toHaveBeenCalledTimes(1);
      const [commentId, body] = vi.mocked(githubMock.updateComment).mock
        .calls[0];
      expect(commentId).toBe(42);
      expect(body).toContain('fresh');
      expect(body).not.toContain('stale');
      expect(githubMock.createComment).not.toHaveBeenCalled();
    });

    it('does not update when mode is create-only and element exists', async () => {
      vi.mocked(githubMock.findExistingComment).mockResolvedValue({
        id: 42,
        body: '<div id="status">stale</div>',
      } as never);

      await action({
        mode: 'create-only',
        html: '<div id="status">fresh</div>',
        selector: '#status',
        parentSelector: null,
      });

      expect(githubMock.updateComment).not.toHaveBeenCalled();
      expect(githubMock.createComment).not.toHaveBeenCalled();
    });

    it('appends element when upserting against a comment that lacks it', async () => {
      vi.mocked(githubMock.findExistingComment).mockResolvedValue({
        id: 7,
        body: '<div id="other">x</div>',
      } as never);

      await action({
        mode: 'upsert',
        html: '<div id="status">new</div>',
        selector: '#status',
        parentSelector: null,
      });

      expect(githubMock.updateComment).toHaveBeenCalledTimes(1);
      const [, body] = vi.mocked(githubMock.updateComment).mock.calls[0];
      expect(body).toContain('<div id="other">x</div>');
      expect(body).toContain('<div id="status">new</div>');
    });
  });

  describe('dependent element (with parentSelector)', () => {
    it('throws when the parent comment cannot be found', async () => {
      vi.mocked(githubMock.findExistingComment).mockResolvedValue(null);

      await expect(
        action({
          mode: 'upsert',
          html: '<tr id="preview-link-dev-svc"><td>x</td></tr>',
          selector: '#preview-link-dev-svc',
          parentSelector: '#deploy-table tbody',
        }),
      ).rejects.toThrow(/Could not find comment/);
    });

    it('reorders and groups table rows by environment after upsert', async () => {
      const initialBody = [
        '<div>',
        '<table id="deploy-table"><tbody>',
        '<tr id="preview-link-prod-svc-a"><td>prod</td><td>svc-a</td></tr>',
        '<tr id="preview-link-dev-svc-b"><td>dev</td><td>svc-b</td></tr>',
        '<tr id="preview-link-dev-svc-a"><td>dev</td><td>svc-a</td></tr>',
        '</tbody></table>',
        '</div>',
      ].join('');

      vi.mocked(githubMock.findExistingComment).mockResolvedValue({
        id: 99,
        body: initialBody,
      } as never);

      await action({
        mode: 'upsert',
        html: '<tr id="preview-link-prod-svc-b"><td>prod</td><td>svc-b</td></tr>',
        selector: '#preview-link-prod-svc-b',
        parentSelector: '#deploy-table tbody',
      });

      expect(githubMock.updateComment).toHaveBeenCalledTimes(1);
      const [, body] = vi.mocked(githubMock.updateComment).mock.calls[0];

      const devIdx = body.indexOf('preview-link-dev-');
      const prodIdx = body.indexOf('preview-link-prod-');
      expect(devIdx).toBeGreaterThan(-1);
      expect(prodIdx).toBeGreaterThan(-1);
      expect(devIdx).toBeLessThan(prodIdx);

      const devSvcAIdx = body.indexOf('preview-link-dev-svc-a');
      const devSvcBIdx = body.indexOf('preview-link-dev-svc-b');
      expect(devSvcAIdx).toBeLessThan(devSvcBIdx);

      expect(body).toMatch(/rowspan="2"/);
    });
  });
});
