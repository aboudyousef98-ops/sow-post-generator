import { describe, it, expect } from 'vitest';
import { renameLegacyNames, renameValue } from './renames';

const OLD = "Ya'rob Alnabelsi";
const NEW = 'Yarob Alnabelsi';

describe('renameValue', () => {
  it('renames the legacy spelling, straight or curly', () => {
    expect(renameValue(OLD)).toBe(NEW);
    expect(renameValue('Ya’rob Alnabelsi')).toBe(NEW);
  });
  it('leaves everyone else alone', () => {
    expect(renameValue('Omar Rajab')).toBe('Omar Rajab');
    expect(renameValue(NEW)).toBe(NEW);
  });
});

describe('renameLegacyNames', () => {
  it('renames a board coordinator', () => {
    const out = renameLegacyNames({ projects: [{ id: 'p1', coordinator: OLD }] });
    expect(out.projects[0].coordinator).toBe(NEW);
  });

  it('renames every known person field, however deep', () => {
    const out = renameLegacyNames({
      projects: [{ coordinator: OLD, updatedBy: OLD, createdBy: OLD }],
      activity: [{ actor: OLD }],
      updates: [{ by: OLD, editedBy: OLD }],
      nested: { deep: { list: [{ author: OLD }, { person: OLD }] } },
      users: [{ displayName: OLD, username: 'yalnabelsi' }],
    });
    expect(out.projects[0]).toEqual({ coordinator: NEW, updatedBy: NEW, createdBy: NEW });
    expect(out.activity[0].actor).toBe(NEW);
    expect(out.updates[0]).toEqual({ by: NEW, editedBy: NEW });
    expect(out.nested.deep.list).toEqual([{ author: NEW }, { person: NEW }]);
    // The LOGIN username is a different field and must never be touched.
    expect(out.users[0]).toEqual({ displayName: NEW, username: 'yalnabelsi' });
  });

  it('renames settings.authors, which is a bare list of names', () => {
    const out = renameLegacyNames({ authors: ['Omar Rajab', OLD], lastAuthor: OLD });
    expect(out.authors).toEqual(['Omar Rajab', NEW]);
    expect(out.lastAuthor).toBe(NEW);
  });

  it('does NOT rename a value that merely looks like the name', () => {
    // A project actually called that, or free text, is data — not a person.
    const out = renameLegacyNames({ projects: [{ name: OLD, text: OLD, coordinator: 'Omar Rajab' }] });
    expect(out.projects[0].name).toBe(OLD);
    expect(out.projects[0].text).toBe(OLD);
  });

  it('is idempotent', () => {
    const once = renameLegacyNames({ projects: [{ coordinator: OLD }] });
    expect(renameLegacyNames(once)).toEqual(once);
  });

  it('returns the SAME object when there is nothing to rename', () => {
    const input = { projects: [{ coordinator: 'Omar Rajab', name: 'Glenda Hodge' }], activity: [] };
    expect(renameLegacyNames(input)).toBe(input);
  });

  it('survives nulls, numbers and empty structures', () => {
    const input = { a: null, b: 3, c: [], d: {}, e: undefined };
    expect(() => renameLegacyNames(input)).not.toThrow();
    expect(renameLegacyNames(input)).toBe(input);
  });
});
