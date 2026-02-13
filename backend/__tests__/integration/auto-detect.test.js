/**
 * Integration Tests: Auto-Detect Question Recognition
 *
 * Tests the automatic question detection and auto-answer triggering:
 * - Question pattern matching (question marks, question words)
 * - Coding task detection
 * - Cooldown management
 * - Screenshot triggering for coding questions
 */

const fixtures = require('../helpers/fixtures');

// We'll mock the server module
let serverTest;

describe('Auto-Detect Question Recognition', () => {
  beforeAll(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.AUTO_DETECT_COOLDOWN = '15000';
    process.env.AUTO_DETECT_MIN_WORDS = '5';

    // Import server test functions
    serverTest = require('../../src/server').__test__;
  });

  describe('isQuestion', () => {
    const { isQuestion } = serverTest || {};

    describe('Question Mark Detection', () => {
      test('detects simple question with question mark', () => {
        const result = isQuestion('What is this?');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('question');
      });

      test('detects complex question with question mark', () => {
        const result = isQuestion('How do I implement this feature in React?');
        expect(result.isQuestion).toBe(true);
      });

      test('detects multiple questions', () => {
        const result = isQuestion('What is this? How does it work?');
        expect(result.isQuestion).toBe(true);
      });
    });

    describe('Question Word Detection', () => {
      test('detects "what" questions', () => {
        const tests = [
          'What is JavaScript',
          'What does this function do',
          'What are the benefits'
        ];

        tests.forEach(q => {
          const result = isQuestion(q);
          expect(result.isQuestion).toBe(true);
          expect(result.type).toBe('question');
        });
      });

      test('detects "how" questions', () => {
        const tests = [
          'How do I implement this',
          'How does this work',
          'How can I improve performance'
        ];

        tests.forEach(q => {
          expect(isQuestion(q).isQuestion).toBe(true);
        });
      });

      test('detects "why" questions', () => {
        const tests = [
          'Why does this happen',
          'Why is it designed this way',
          'Why should I use this'
        ];

        tests.forEach(q => {
          expect(isQuestion(q).isQuestion).toBe(true);
        });
      });

      test('detects "when" questions', () => {
        const tests = [
          'When should I use this',
          'When does this trigger',
          'When is the best time'
        ];

        tests.forEach(q => {
          expect(isQuestion(q).isQuestion).toBe(true);
        });
      });

      test('detects "where" questions', () => {
        const tests = [
          'Where can I find this',
          'Where should I place this',
          'Where is the documentation'
        ];

        tests.forEach(q => {
          expect(isQuestion(q).isQuestion).toBe(true);
        });
      });

      test('detects "who" questions', () => {
        const tests = [
          'Who is responsible for this',
          'Who created this library',
          'Who should I contact'
        ];

        tests.forEach(q => {
          expect(isQuestion(q).isQuestion).toBe(true);
        });
      });

      test('detects "which" questions', () => {
        const tests = [
          'Which option is better',
          'Which approach should I use',
          'Which library do you recommend'
        ];

        tests.forEach(q => {
          expect(isQuestion(q).isQuestion).toBe(true);
        });
      });

      test('detects "can you" questions', () => {
        const tests = [
          'Can you explain this',
          'Can you help me',
          'Can you show me an example'
        ];

        tests.forEach(q => {
          expect(isQuestion(q).isQuestion).toBe(true);
        });
      });

      test('detects "could you" questions', () => {
        expect(isQuestion('Could you clarify this').isQuestion).toBe(true);
      });

      test('detects "would you" questions', () => {
        expect(isQuestion('Would you recommend this approach').isQuestion).toBe(true);
      });

      test('detects "will you" questions', () => {
        expect(isQuestion('Will you help me debug this').isQuestion).toBe(true);
      });

      test('detects "do you" questions', () => {
        expect(isQuestion('Do you know how this works').isQuestion).toBe(true);
      });

      test('detects "does" questions', () => {
        expect(isQuestion('Does this function handle errors').isQuestion).toBe(true);
      });

      test('detects "did" questions', () => {
        expect(isQuestion('Did you see the error message').isQuestion).toBe(true);
      });

      test('detects "is it" questions', () => {
        expect(isQuestion('Is it possible to optimize this').isQuestion).toBe(true);
      });

      test('detects "are there" questions', () => {
        expect(isQuestion('Are there any alternatives').isQuestion).toBe(true);
      });

      test('detects "tell me" questions', () => {
        expect(isQuestion('Tell me about closures').isQuestion).toBe(true);
      });

      test('detects "explain" questions', () => {
        expect(isQuestion('Explain how async await works').isQuestion).toBe(true);
      });
    });

    describe('Coding Task Detection', () => {
      test('detects "write a" tasks', () => {
        const result = isQuestion('Write a function to reverse a string');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "implement" tasks', () => {
        const result = isQuestion('Implement a binary search algorithm');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "create a" tasks', () => {
        const result = isQuestion('Create a React component for user profile');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "build a" tasks', () => {
        const result = isQuestion('Build a REST API endpoint');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "design a" tasks', () => {
        const result = isQuestion('Design a database schema');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "code a" tasks', () => {
        const result = isQuestion('Code a sorting algorithm');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "fix the" tasks', () => {
        const result = isQuestion('Fix the bug in this code');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "debug" tasks', () => {
        const result = isQuestion('Debug the error in this function');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "refactor" tasks', () => {
        const result = isQuestion('Refactor this component for better performance');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "optimize" tasks', () => {
        const result = isQuestion('Optimize this database query');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "solve" tasks', () => {
        const result = isQuestion('Solve this algorithm problem');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "find the bug" tasks', () => {
        const result = isQuestion('Find the bug in this code');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "what\'s wrong" tasks', () => {
        const result = isQuestion('What\'s wrong with this implementation');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "correct this" tasks', () => {
        const result = isQuestion('Correct this syntax error');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "modify" tasks', () => {
        const result = isQuestion('Modify the function to handle edge cases');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "update the" tasks', () => {
        const result = isQuestion('Update the API to support pagination');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "add a" tasks', () => {
        const result = isQuestion('Add a validation function');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects "remove the" tasks', () => {
        const result = isQuestion('Remove the deprecated code');
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });
    });

    describe('Statement Rejection', () => {
      test('rejects plain statements', () => {
        const statements = [
          'This is a statement',
          'I am working on a project',
          'The code runs fine',
          'Thank you for your help',
          'This function is working correctly',
          'I understand how this works'
        ];

        statements.forEach(stmt => {
          const result = isQuestion(stmt);
          expect(result.isQuestion).toBe(false);
        });
      });

      test('rejects incomplete phrases', () => {
        const incomplete = [
          'Just testing',
          'Running the code',
          'Looking at the output'
        ];

        incomplete.forEach(phrase => {
          expect(isQuestion(phrase).isQuestion).toBe(false);
        });
      });
    });

    describe('Edge Cases', () => {
      test('handles empty string', () => {
        const result = isQuestion('');
        expect(result.isQuestion).toBe(false);
      });

      test('handles whitespace only', () => {
        const result = isQuestion('   ');
        expect(result.isQuestion).toBe(false);
      });

      test('handles null', () => {
        const result = isQuestion(null);
        expect(result.isQuestion).toBe(false);
      });

      test('handles undefined', () => {
        const result = isQuestion(undefined);
        expect(result.isQuestion).toBe(false);
      });

      test('handles very long text', () => {
        const longQuestion = 'What is ' + 'A'.repeat(10000) + '?';
        const result = isQuestion(longQuestion);
        expect(result.isQuestion).toBe(true);
      });

      test('handles mixed case', () => {
        const result = isQuestion('WhAt Is ThIs?');
        expect(result.isQuestion).toBe(true);
      });

      test('handles question words mid-sentence', () => {
        // "what" in middle shouldn't trigger
        const result = isQuestion('I know what this does');
        expect(result.isQuestion).toBe(false);
      });

      test('handles sentence ending with question mark', () => {
        const result = isQuestion('This is confusing?');
        expect(result.isQuestion).toBe(true);
      });
    });

    describe('Real-World Examples from Fixtures', () => {
      test('detects coding question from fixtures', () => {
        const result = isQuestion(fixtures.questions.coding);
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects simple question from fixtures', () => {
        const result = isQuestion(fixtures.questions.simple);
        expect(result.isQuestion).toBe(true);
      });

      test('detects implement task from fixtures', () => {
        const result = isQuestion(fixtures.questions.implement);
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('detects fix task from fixtures', () => {
        const result = isQuestion(fixtures.questions.fix);
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });

      test('rejects statement from fixtures', () => {
        const result = isQuestion(fixtures.questions.statement);
        expect(result.isQuestion).toBe(false);
      });
    });
  });

  describe('Cooldown Management', () => {
    test('cooldown period is configurable', () => {
      const cooldown = parseInt(process.env.AUTO_DETECT_COOLDOWN || '15000');
      expect(cooldown).toBeGreaterThan(0);
    });

    test('cooldown logic validates time difference', () => {
      const AUTO_DETECT_COOLDOWN_MS = 15000;
      const now = Date.now();

      // Just triggered - should not allow
      const recentTime = now - 1000; // 1 second ago
      const canTriggerRecent = (now - recentTime) >= AUTO_DETECT_COOLDOWN_MS;
      expect(canTriggerRecent).toBe(false);

      // 20 seconds ago - should allow
      const oldTime = now - 20000;
      const canTriggerOld = (now - oldTime) >= AUTO_DETECT_COOLDOWN_MS;
      expect(canTriggerOld).toBe(true);

      // Exactly at cooldown - should allow
      const exactTime = now - AUTO_DETECT_COOLDOWN_MS;
      const canTriggerExact = (now - exactTime) >= AUTO_DETECT_COOLDOWN_MS;
      expect(canTriggerExact).toBe(true);
    });

    test('session-specific cooldown tracking', () => {
      const autoDetectState = new Map();

      // Session 1 triggered
      autoDetectState.set('session-1', {
        enabled: true,
        lastTriggeredAt: Date.now()
      });

      // Session 2 not triggered yet
      autoDetectState.set('session-2', {
        enabled: true,
        lastTriggeredAt: null
      });

      expect(autoDetectState.get('session-1').lastTriggeredAt).toBeTruthy();
      expect(autoDetectState.get('session-2').lastTriggeredAt).toBeNull();
    });
  });

  describe('Screenshot Trigger Logic', () => {
    const { isQuestion } = serverTest || {};

    test('coding questions should trigger screenshot', () => {
      const codingQuestions = [
        'Write a function to sort an array',
        'Fix the bug in this code',
        'Debug the error',
        'Implement a binary search'
      ];

      codingQuestions.forEach(q => {
        const result = isQuestion(q);
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('coding');
      });
    });

    test('non-coding questions should not trigger screenshot', () => {
      const regularQuestions = [
        'What is JavaScript?',
        'How does closure work?',
        'Why is performance important?',
        'When should I use async/await?'
      ];

      regularQuestions.forEach(q => {
        const result = isQuestion(q);
        expect(result.isQuestion).toBe(true);
        expect(result.type).toBe('question');
      });
    });
  });

  describe('Minimum Words Requirement', () => {
    const { isQuestion } = serverTest || {};

    test('short questions below minimum word count', () => {
      const SHORT_QUESTIONS = [
        'What?',  // 1 word
        'How why?',  // 2 words
        'What is it?',  // 3 words
        'How does this?'  // 3 words
      ];

      // These should still be detected as questions
      SHORT_QUESTIONS.forEach(q => {
        const result = isQuestion(q);
        expect(result.isQuestion).toBe(true);
      });
    });

    test('questions with sufficient word count', () => {
      const LONG_QUESTIONS = [
        'What is the purpose of this function?',  // 7 words
        'How do I implement error handling here?',  // 7 words
      ];

      LONG_QUESTIONS.forEach(q => {
        const result = isQuestion(q);
        expect(result.isQuestion).toBe(true);
      });
    });
  });
});
