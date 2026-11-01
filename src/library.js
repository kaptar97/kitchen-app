// Built-in starter recipes. Written for this app. Ingredients are parsed at load time.
import { parseIngredient } from './recipes.js'

const R = (id, emoji, title, servings, prep, cook, tags, ingredients, steps) => ({
  id: `lib-${id}`, library: true, emoji, title, servings, prep_minutes: prep, cook_minutes: cook, tags,
  ingredients: ingredients.map(parseIngredient), steps,
})

export const LIBRARY = [
  // ---------- Keto / low-carb dinners ----------
  R('tuscan-chicken', '🍗', 'Creamy Tuscan Chicken', 4, 10, 25, ['Keto', 'Low-carb', 'Dinner'], [
    '1 1/2 lb chicken thighs', '1 tbsp olive oil', '3 cloves garlic, minced', '1 cup heavy cream', '1/2 cup grated parmesan',
    '1/3 cup sun-dried tomatoes', '2 cups spinach', '1 tsp Italian seasoning', 'Salt and pepper to taste',
  ], [
    'Season the chicken with salt, pepper and Italian seasoning.',
    'Brown the chicken in olive oil in a large skillet over medium-high heat, about 5 minutes per side. Move to a plate.',
    'Lower the heat to medium, add the garlic and cook 30 seconds.',
    'Stir in the cream, parmesan and sun-dried tomatoes and simmer until slightly thickened, 3 to 4 minutes.',
    'Add the spinach and stir until wilted. Return the chicken to the pan and spoon the sauce over it until hot.',
  ]),
  R('garlic-butter-steak', '🥩', 'Garlic Butter Steak Bites', 4, 10, 10, ['Keto', 'Low-carb', 'Quick', 'Dinner'], [
    '2 lb sirloin steak, cut into 1-inch cubes', '3 tbsp butter', '4 cloves garlic, minced', '1 tbsp olive oil',
    '1 tbsp chopped parsley', 'Salt and pepper to taste',
  ], [
    'Pat the steak cubes dry and season well with salt and pepper.',
    'Heat the oil in a cast-iron skillet over high heat until shimmering.',
    'Sear the steak in a single layer, in batches if needed, 2 to 3 minutes until browned on most sides.',
    'Lower the heat, add the butter and garlic, and toss for 1 minute until fragrant.',
    'Sprinkle with parsley and serve right away.',
  ]),
  R('cheeseburger-casserole', '🍔', 'Cheeseburger Casserole', 6, 10, 30, ['Keto', 'Low-carb', 'Kid-friendly', 'Dinner', 'Meal prep'], [
    '2 lb ground beef', '1/2 onion, diced', '2 cloves garlic, minced', '4 large eggs', '1/2 cup heavy cream',
    '2 tbsp tomato paste', '1 tbsp mustard', '2 cups shredded cheddar', '1/4 cup diced pickles', 'Salt and pepper to taste',
  ], [
    'Heat the oven to 350°F.',
    'Brown the ground beef with the onion and garlic. Drain the fat and season with salt and pepper.',
    'Spread the beef in a 9x13 baking dish and sprinkle with half the cheddar.',
    'Whisk the eggs, cream, tomato paste and mustard and pour over the beef.',
    'Top with the rest of the cheddar and bake 25 to 30 minutes until set and golden. Scatter pickles on top.',
  ]),
  R('salmon-lemon', '🐟', 'Lemon Butter Salmon', 4, 5, 15, ['Keto', 'Low-carb', 'Quick', 'Dinner'], [
    '4 salmon fillets', '3 tbsp butter', '2 cloves garlic, minced', '1 lemon', '1 tsp dried dill', 'Salt and pepper to taste',
  ], [
    'Heat the oven to 400°F and line a baking sheet with foil.',
    'Place the salmon on the sheet and season with salt, pepper and dill.',
    'Melt the butter with the garlic and the juice of half the lemon; spoon over the salmon.',
    'Bake 12 to 15 minutes until the salmon flakes easily. Serve with the remaining lemon in wedges.',
  ]),
  R('pork-chops-mushroom', '🍄', 'Pork Chops with Mushroom Cream Sauce', 4, 10, 20, ['Keto', 'Low-carb', 'Dinner'], [
    '4 boneless pork chops', '8 oz mushrooms, sliced', '2 tbsp butter', '2 cloves garlic, minced', '3/4 cup heavy cream',
    '1/2 tsp dried thyme', 'Salt and pepper to taste',
  ], [
    'Season the pork chops with salt, pepper and thyme.',
    'Sear in butter in a skillet over medium-high heat, 4 to 5 minutes per side, until cooked through. Set aside.',
    'Add the mushrooms to the pan and cook until browned, about 5 minutes. Add the garlic for 30 seconds.',
    'Pour in the cream, simmer 2 to 3 minutes until thick, then return the chops to warm through.',
  ]),
  R('chicken-broccoli-bake', '🥦', 'Cheesy Chicken & Broccoli Bake', 4, 10, 25, ['Keto', 'Low-carb', 'Kid-friendly', 'Dinner'], [
    '1 1/2 lb chicken breasts, cubed', '4 cups broccoli florets', '4 oz cream cheese, softened', '1/2 cup heavy cream',
    '1 1/2 cups shredded cheddar', '1 tsp garlic powder', 'Salt and pepper to taste',
  ], [
    'Heat the oven to 375°F.',
    'Season the chicken with salt, pepper and garlic powder and spread it in a baking dish with the broccoli.',
    'Whisk the cream cheese and heavy cream until smooth and pour over the top.',
    'Cover with the cheddar and bake 25 minutes until the chicken is cooked and the cheese is bubbly.',
  ]),
  R('shrimp-scampi-zoodles', '🍤', 'Shrimp Scampi with Zucchini Noodles', 4, 15, 10, ['Keto', 'Low-carb', 'Quick', 'Dinner'], [
    '1 lb shrimp, peeled', '4 zucchini, spiralized', '3 tbsp butter', '4 cloves garlic, minced', '1/4 tsp red pepper flakes',
    '1 lemon', '1/4 cup grated parmesan', 'Salt and pepper to taste',
  ], [
    'Melt the butter in a large skillet over medium heat. Add the garlic and red pepper flakes for 30 seconds.',
    'Add the shrimp, season with salt and pepper, and cook 2 minutes per side until pink.',
    'Add the zucchini noodles and the juice of the lemon. Toss for 2 minutes, just until the noodles are warm.',
    'Top with parmesan and serve.',
  ]),
  R('bacon-ranch-chicken', '🥓', 'Bacon Ranch Chicken Skillet', 4, 10, 20, ['Keto', 'Low-carb', 'Kid-friendly', 'Dinner'], [
    '1 1/2 lb chicken thighs, cubed', '6 slices bacon, chopped', '1 tbsp ranch seasoning', '1 cup shredded mozzarella',
    '2 green onions, sliced',
  ], [
    'Cook the bacon in a large skillet until crisp. Remove, leaving the fat in the pan.',
    'Toss the chicken with the ranch seasoning and cook in the bacon fat until browned and cooked through, 8 to 10 minutes.',
    'Sprinkle on the bacon and mozzarella, cover, and cook 2 minutes until melted.',
    'Top with green onions.',
  ]),
  R('egg-roll-bowl', '🥢', 'Egg Roll in a Bowl', 4, 10, 15, ['Keto', 'Low-carb', 'Quick', 'Dinner', 'Meal prep'], [
    '1 lb ground pork', '1 bag coleslaw mix', '3 cloves garlic, minced', '1 tbsp fresh ginger, grated', '3 tbsp soy sauce',
    '1 tsp sesame oil', '2 green onions, sliced',
  ], [
    'Brown the pork in a large skillet, breaking it up. Drain if needed.',
    'Add the garlic and ginger and cook 1 minute.',
    'Add the coleslaw mix and soy sauce and cook, stirring, until the cabbage softens, about 5 minutes.',
    'Drizzle with sesame oil and top with green onions.',
  ]),
  R('stuffed-peppers', '🫑', 'Low-Carb Stuffed Peppers', 4, 15, 35, ['Keto', 'Low-carb', 'Dinner'], [
    '4 bell peppers', '1 lb ground beef', '1 cup riced cauliflower', '1/2 cup marinara sauce', '1 tsp Italian seasoning',
    '1 cup shredded mozzarella', 'Salt and pepper to taste',
  ], [
    'Heat the oven to 375°F. Cut the tops off the peppers and remove the seeds.',
    'Brown the beef, then stir in the cauliflower, marinara, Italian seasoning, salt and pepper. Cook 3 minutes.',
    'Fill the peppers with the mixture and stand them in a baking dish.',
    'Cover with foil and bake 25 minutes. Uncover, top with mozzarella and bake 10 more minutes.',
  ]),

  // ---------- Crockpot ----------
  R('crockpot-chili', '🌶️', 'Slow Cooker No-Bean Chili', 8, 15, 360, ['Keto', 'Low-carb', 'Crockpot', 'Dinner', 'Meal prep'], [
    '2 lb ground beef', '1 onion, diced', '1 bell pepper, diced', '3 cloves garlic, minced', '1 can diced tomatoes',
    '1 can tomato sauce', '2 tbsp chili powder', '1 tbsp ground cumin', '1 tsp smoked paprika', 'Salt and pepper to taste',
    '1 cup shredded cheddar',
  ], [
    'Brown the beef with the onion and drain the fat.',
    'Add the beef and everything except the cheddar to the slow cooker and stir.',
    'Cook on low 6 hours or high 3 hours.',
    'Serve topped with cheddar.',
  ]),
  R('crockpot-pulled-pork', '🐖', 'Slow Cooker Pulled Pork', 8, 10, 480, ['Crockpot', 'Kid-friendly', 'Dinner', 'Meal prep'], [
    '3 lb pork shoulder', '1 onion, sliced', '1 tbsp brown sugar', '1 tbsp smoked paprika', '1 tsp garlic powder',
    '1 cup chicken broth', '1 cup barbecue sauce', 'Salt and pepper to taste', '8 hamburger buns',
  ], [
    'Mix the brown sugar, paprika, garlic powder, salt and pepper and rub it all over the pork.',
    'Put the onion in the slow cooker, set the pork on top and pour in the broth.',
    'Cook on low 8 hours until the pork pulls apart easily.',
    'Shred with two forks, drain most of the liquid, and stir in the barbecue sauce. Serve on buns.',
  ]),
  R('crockpot-salsa-chicken', '🌮', 'Slow Cooker Salsa Chicken', 6, 5, 240, ['Crockpot', 'Kid-friendly', 'Low-carb', 'Dinner', 'Meal prep'], [
    '2 lb chicken breasts', '1 jar salsa', '1 tbsp taco seasoning', '4 oz cream cheese', '1 cup shredded Mexican cheese',
  ], [
    'Put the chicken in the slow cooker, sprinkle with taco seasoning and pour the salsa over it.',
    'Cook on low 4 hours or high 2 hours.',
    'Shred the chicken in the pot and stir in the cream cheese until melted.',
    'Serve in tortillas, over rice or lettuce, topped with cheese.',
  ]),
  R('crockpot-pot-roast', '🥕', 'Slow Cooker Pot Roast', 6, 15, 480, ['Crockpot', 'Kid-friendly', 'Dinner'], [
    '3 lb chuck roast', '1 lb baby potatoes', '4 carrots, cut in chunks', '1 onion, quartered', '2 cups beef broth',
    '1 packet onion soup mix', '2 tbsp olive oil', 'Salt and pepper to taste',
  ], [
    'Season the roast with salt and pepper and sear in olive oil on all sides until browned.',
    'Put the potatoes, carrots and onion in the slow cooker and set the roast on top.',
    'Whisk the broth with the onion soup mix and pour it over.',
    'Cook on low 8 hours until fork-tender.',
  ]),
  R('crockpot-butter-chicken', '🍛', 'Slow Cooker Butter Chicken', 6, 10, 300, ['Crockpot', 'Low-carb', 'Dinner'], [
    '2 lb chicken thighs', '1 onion, diced', '3 cloves garlic, minced', '1 can tomato sauce', '1 cup heavy cream',
    '3 tbsp butter', '2 tbsp garam masala', '1 tsp curry powder', 'Salt and pepper to taste',
  ], [
    'Add the chicken, onion, garlic, tomato sauce, butter and spices to the slow cooker.',
    'Cook on low 5 hours or high 3 hours.',
    'Break the chicken into bite-size pieces and stir in the cream. Let it heat through 15 minutes.',
    'Serve with rice, naan or cauliflower rice.',
  ]),

  // ---------- Family classics ----------
  R('spaghetti-meat-sauce', '🍝', 'Spaghetti with Meat Sauce', 6, 10, 25, ['Kid-friendly', 'Dinner'], [
    '1 lb spaghetti', '1 lb ground beef', '1/2 onion, diced', '2 cloves garlic, minced', '1 jar marinara sauce',
    '1 tsp Italian seasoning', '1/4 cup grated parmesan', 'Salt and pepper to taste',
  ], [
    'Cook the spaghetti in salted boiling water according to the package. Drain.',
    'Meanwhile, brown the beef with the onion. Drain the fat and add the garlic for 1 minute.',
    'Stir in the marinara and Italian seasoning and simmer 10 minutes.',
    'Serve the sauce over the spaghetti with parmesan.',
  ]),
  R('chicken-tacos', '🌮', 'Easy Chicken Tacos', 4, 10, 15, ['Kid-friendly', 'Quick', 'Dinner'], [
    '1 1/2 lb chicken breasts', '1 tbsp taco seasoning', '1 tbsp olive oil', '8 tortillas', '1 cup shredded lettuce',
    '1 cup shredded cheddar', '1/2 cup salsa', '1/2 cup sour cream',
  ], [
    'Toss the chicken with oil and taco seasoning.',
    'Cook in a skillet over medium-high heat 6 to 7 minutes per side until cooked through. Rest 5 minutes, then slice.',
    'Warm the tortillas in a dry pan or microwave.',
    'Fill with chicken, lettuce, cheese, salsa and sour cream.',
  ]),
  R('sheet-pan-sausage', '🌭', 'Sheet Pan Sausage & Veggies', 4, 10, 25, ['Kid-friendly', 'Quick', 'Low-carb', 'Dinner'], [
    '1 package smoked sausage, sliced', '2 bell peppers, chopped', '1 zucchini, chopped', '1/2 onion, chopped',
    '2 tbsp olive oil', '1 tsp garlic powder', '1 tsp smoked paprika', 'Salt and pepper to taste',
  ], [
    'Heat the oven to 425°F.',
    'Toss everything on a sheet pan until coated in oil and spices.',
    'Spread in one layer and roast 20 to 25 minutes, stirring halfway, until the veggies are tender and browned.',
  ]),
  R('baked-ziti', '🧀', 'Baked Ziti', 8, 15, 30, ['Kid-friendly', 'Dinner', 'Meal prep'], [
    '1 lb ziti pasta', '1 lb ground Italian sausage', '1 jar marinara sauce', '15 oz ricotta cheese',
    '2 cups shredded mozzarella', '1/2 cup grated parmesan', '1 large egg',
  ], [
    'Heat the oven to 375°F. Boil the ziti 2 minutes less than the package says and drain.',
    'Brown the sausage and stir in the marinara.',
    'Mix the ricotta, egg, half the mozzarella and the parmesan.',
    'Toss the pasta with the sauce and the ricotta mix, spread in a 9x13 dish and top with the rest of the mozzarella.',
    'Bake 25 to 30 minutes until bubbly.',
  ]),
  R('chicken-fried-rice', '🍚', 'Chicken Fried Rice', 4, 10, 15, ['Kid-friendly', 'Quick', 'Dinner'], [
    '3 cups cooked rice', '2 chicken breasts, diced', '2 large eggs', '1 cup frozen peas and carrots', '3 tbsp soy sauce',
    '2 tbsp vegetable oil', '2 green onions, sliced', '2 cloves garlic, minced',
  ], [
    'Heat 1 tbsp oil in a large skillet and cook the chicken until done. Move to a plate.',
    'Scramble the eggs in the same pan and set aside with the chicken.',
    'Add the remaining oil, the garlic and the peas and carrots and cook 2 minutes.',
    'Add the rice and soy sauce and stir-fry 3 minutes. Stir in the chicken, eggs and green onions.',
  ]),
  R('mac-and-cheese', '🧀', 'Stovetop Mac and Cheese', 6, 5, 15, ['Kid-friendly', 'Quick', 'Dinner'], [
    '1 lb elbow macaroni', '3 tbsp butter', '3 tbsp flour', '2 1/2 cups milk', '3 cups shredded cheddar',
    '1/2 tsp garlic powder', 'Salt and pepper to taste',
  ], [
    'Cook the macaroni according to the package and drain.',
    'In the same pot, melt the butter, whisk in the flour and cook 1 minute.',
    'Slowly whisk in the milk and simmer, stirring, until thickened, about 4 minutes.',
    'Off the heat, stir in the cheese and garlic powder until smooth. Add the pasta, season, and stir.',
  ]),
  R('turkey-burgers', '🍔', 'Juicy Turkey Burgers', 4, 10, 12, ['Kid-friendly', 'Quick', 'Dinner'], [
    '1 lb ground turkey', '1/4 cup breadcrumbs', '1 large egg', '1 tsp garlic powder', '1 tsp Worcestershire sauce',
    '4 hamburger buns', '4 slices cheddar', 'Salt and pepper to taste',
  ], [
    'Mix the turkey, breadcrumbs, egg, garlic powder, Worcestershire, salt and pepper. Shape into 4 patties.',
    'Cook in an oiled skillet or on the grill over medium heat, 5 to 6 minutes per side, until cooked through.',
    'Top with cheese for the last minute and serve on buns.',
  ]),

  // ---------- Breakfast ----------
  R('egg-muffins', '🧁', 'Sausage & Cheese Egg Muffins', 12, 10, 20, ['Keto', 'Low-carb', 'Breakfast', 'Meal prep', 'Kid-friendly'], [
    '10 large eggs', '1/2 lb breakfast sausage', '1 cup shredded cheddar', '1/2 cup spinach, chopped', '1/4 cup milk',
    'Salt and pepper to taste',
  ], [
    'Heat the oven to 350°F and grease a 12-cup muffin tin.',
    'Brown the sausage and divide it among the cups with the spinach and cheese.',
    'Whisk the eggs, milk, salt and pepper and pour into the cups.',
    'Bake 18 to 20 minutes until set. They keep 4 days in the fridge.',
  ]),
  R('pancakes', '🥞', 'Fluffy Pancakes', 4, 5, 15, ['Kid-friendly', 'Breakfast'], [
    '2 cups flour', '2 tbsp sugar', '2 tsp baking powder', '1/2 tsp salt', '1 3/4 cups milk', '2 large eggs',
    '4 tbsp butter, melted', 'Maple syrup for serving',
  ], [
    'Whisk the flour, sugar, baking powder and salt in a bowl.',
    'Whisk the milk, eggs and melted butter in another bowl, then stir into the dry ingredients until just combined.',
    'Cook 1/4-cup scoops on a buttered griddle over medium heat until bubbles form, then flip and cook 1 minute more.',
    'Serve with maple syrup.',
  ]),
  R('bacon-egg-cups', '🥓', 'Bacon Egg Cups', 6, 5, 18, ['Keto', 'Low-carb', 'Breakfast', 'Quick'], [
    '12 slices bacon', '6 large eggs', '1/4 cup shredded cheddar', 'Salt and pepper to taste',
  ], [
    'Heat the oven to 400°F. Partly cook the bacon in a skillet until just starting to brown but still bendable.',
    'Line 6 muffin cups with 2 slices of bacon each.',
    'Crack an egg into each cup, season, and top with cheese.',
    'Bake 12 to 15 minutes, until the whites are set.',
  ]),
  R('cloud-omelet', '🍳', 'Loaded Veggie Omelet', 1, 5, 7, ['Keto', 'Low-carb', 'Breakfast', 'Quick'], [
    '3 large eggs', '1 tbsp butter', '1/4 cup diced bell pepper', '1/4 cup mushrooms, sliced', '1/4 cup shredded cheddar',
    'Salt and pepper to taste',
  ], [
    'Melt the butter in a nonstick skillet and cook the pepper and mushrooms 3 minutes. Remove.',
    'Whisk the eggs with salt and pepper and pour into the pan over medium-low heat.',
    'When almost set, add the veggies and cheese to one half, fold, and cook 1 minute more.',
  ]),

  // ---------- Lunch / sides / snacks ----------
  R('chicken-salad', '🥗', 'Classic Chicken Salad', 4, 10, 0, ['Keto', 'Low-carb', 'Lunch', 'Quick', 'Meal prep'], [
    '3 cups cooked chicken, chopped', '1/2 cup mayonnaise', '1 celery stalk, diced', '1 tbsp mustard', '1 tbsp lemon juice',
    'Salt and pepper to taste',
  ], [
    'Stir the mayo, mustard, lemon juice, salt and pepper together.',
    'Fold in the chicken and celery.',
    'Serve in lettuce cups, on bread, or with crackers.',
  ]),
  R('cauliflower-mash', '🥔', 'Garlic Cauliflower Mash', 4, 5, 15, ['Keto', 'Low-carb', 'Quick'], [
    '1 head cauliflower, cut into florets', '3 tbsp butter', '2 oz cream cheese', '1/4 cup grated parmesan',
    '1 clove garlic, minced', 'Salt and pepper to taste',
  ], [
    'Boil or steam the cauliflower until very tender, about 10 minutes. Drain well.',
    'Blend or mash with the butter, cream cheese, parmesan and garlic until smooth.',
    'Season with salt and pepper.',
  ]),
  R('grilled-cheese-soup', '🍅', 'Tomato Soup & Grilled Cheese', 4, 10, 20, ['Kid-friendly', 'Lunch'], [
    '2 cans crushed tomatoes', '1 cup chicken broth', '1/2 onion, diced', '2 tbsp butter', '1/2 cup heavy cream',
    '8 slices bread', '8 slices cheddar', 'Salt and pepper to taste',
  ], [
    'Melt 1 tbsp butter in a pot and cook the onion until soft. Add the tomatoes and broth and simmer 15 minutes.',
    'Blend until smooth, stir in the cream and season.',
    'Make sandwiches with the bread and cheese, butter the outsides, and cook in a skillet until golden on both sides.',
  ]),
  R('fat-bombs', '🍫', 'Peanut Butter Chocolate Fat Bombs', 12, 10, 0, ['Keto', 'Low-carb', 'Snack', 'Dessert'], [
    '1/2 cup peanut butter', '1/4 cup coconut oil', '2 tbsp cocoa powder', '2 tbsp powdered sweetener', '1 tsp vanilla extract',
  ], [
    'Melt the peanut butter and coconut oil together until smooth.',
    'Stir in the cocoa, sweetener and vanilla.',
    'Pour into a mini muffin tin or silicone mold and freeze 30 minutes. Keep in the fridge.',
  ]),
]
