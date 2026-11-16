// 128 short, distinct, easy-to-say words for the two-word release check.
export const WORDS = (
  'amber anchor apple arrow aspen atlas badge bamboo banjo basil beacon berry bison blossom bramble breeze ' +
  'bridge brook cabin cactus camel candle canyon cedar chalk cherry cider clover cobalt comet copper coral ' +
  'cotton crane cricket dahlia delta desert dolphin dove drift eagle ember falcon fern fiddle flint forest ' +
  'fossil garden ginger glacier granite grape harbor hazel heron honey island ivory jasmine jungle kettle ' +
  'kiwi lagoon lantern lemon lily linen lotus maple marble meadow melon mint moss nectar nutmeg oak ' +
  'ocean olive orbit orchid otter owl palm panda pebble pepper pine planet plum pony prairie quartz ' +
  'quill rabbit radish raven reef ribbon river robin saffron sage salmon sandal sapphire shell silver sparrow ' +
  'spruce stone summit swan tango thistle tiger timber topaz tulip tundra velvet violet walnut willow yarrow zebra'
).split(' ');
if (WORDS.length !== 128 || new Set(WORDS).size !== 128) throw new Error('word list must have 128 distinct words');
