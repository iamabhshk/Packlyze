import { describe, it, expect } from 'vitest';
import { Packlyze } from './packlyze';

describe('Packlyze', () => {
  it('should throw error for missing stats file', () => {
    expect(() => new Packlyze('nonexistent.json')).toThrow('Stats file not found');
  });

  // Add more tests as needed, e.g., with a mock stats file
});
