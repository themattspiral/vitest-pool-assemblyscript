export default {
  branches: ['release'],
  plugins: [
    ['@semantic-release/commit-analyzer', {
      releaseRules: [
        // Stay in 0.x: remap breaking and feature changes to minor bumps
        { breaking: true, release: 'minor' },
        { type: 'feat', release: 'minor' },

        { type: 'fix', release: 'patch' },
        { type: 'perf', release: 'patch' },
      ]
    }],
    ['@semantic-release/release-notes-generator', {
      preset: 'conventionalcommits',
      presetConfig: {
        types: [
          { type: 'feat', section: '✨ Features' },
          { type: 'fix', section: '🐛 Bug Fixes' },
          { type: 'perf', section: '⚡ Performance', hidden: false },
          { type: 'docs', section: '📝 Documentation', hidden: false },
          { type: 'style', hidden: true },
          { type: 'refactor', hidden: true },
          { type: 'test', hidden: true },
          { type: 'build', hidden: true },
          { type: 'ci', hidden: true },
          { type: 'chore', hidden: true },
        ]
      },
      writerOpts: {
        commitGroupsSort: (a, b) => {
          const order = ['✨ Features', '🐛 Bug Fixes', '⚡ Performance', '📝 Documentation'];
          const aIndex = order.indexOf(a.title);
          const bIndex = order.indexOf(b.title);
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        },
        commitsSort: ['scope', 'subject'],
      }
    }],
    ['@semantic-release/npm', { npmPublish: false, tarballDir: '.' }],
    ['@semantic-release/github', { assets: ['*.tgz'] }],
  ]
};
