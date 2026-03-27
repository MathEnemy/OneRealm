import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const address = '0xe2e0000000000000000000000000000000000000000000000000000000000001';
    const packageId = '0xe2e';
    const state = {
      nextId: 1,
      heroes: [] as any[],
      equipments: [] as any[],
      materials: [] as any[],
      sessions: new Map<string, any>(),
      apiSessionToken: 'e2e-api-token',
    };

    const b64 = (value: string) => btoa(value);
    const nextId = (prefix: string) => `${prefix}-${state.nextId++}`;
    const professionRank = (xp: number) => (xp >= 7 ? 2 : xp >= 3 ? 1 : 0);

    const ownedObjects = (owner: string, structType: string) => {
      if (structType.includes('::hero::Hero')) {
        return state.heroes.filter((hero) => hero.owner === owner).map((hero) => ({
          data: {
            objectId: hero.id,
            content: {
              fields: {
                name: b64(hero.name),
                level: hero.level,
                base_power: hero.base_power,
                archetype: hero.archetype,
                profession: hero.profession,
                profession_xp: hero.profession_xp,
              },
            },
          },
        }));
      }
      if (structType.includes('::equipment::Equipment')) {
        return state.equipments.filter((item) => item.owner === owner && !item.equippedTo).map((item) => ({
          data: {
            objectId: item.id,
            content: {
              fields: {
                name: b64(item.name),
                power: item.power,
                rarity: item.rarity,
                eq_type: item.eq_type,
                affix: item.affix,
              },
            },
          },
        }));
      }
      return state.materials.filter((item) => item.owner === owner).map((item) => ({
        data: {
          objectId: item.id,
          content: {
            fields: {
              name: b64(item.name),
              rarity: item.rarity,
              value: item.value,
              material_type: item.material_type,
            },
          },
        },
      }));
    };

    const getHero = (id: string) => state.heroes.find((hero) => hero.id === id);
    const getEquipment = (id: string) => state.equipments.find((item) => item.id === id);
    const getMaterial = (id: string) => state.materials.find((item) => item.id === id);

    const createEquipment = (owner: string, name: string, eq_type: number, affix: number, power = 24, rarity = 1) => {
      const equipment = { id: nextId('eq'), owner, equippedTo: null as string | null, slot: null as string | null, name, eq_type, affix, power, rarity };
      state.equipments.push(equipment);
      return equipment;
    };

    const createMaterial = (owner: string, name: string, material_type: number, value = 2, rarity = 1) => {
      const material = { id: nextId('mat'), owner, name, material_type, value, rarity };
      state.materials.push(material);
      return material;
    };

    const removeMaterials = (ids: string[]) => {
      state.materials = state.materials.filter((item) => !ids.includes(item.id));
    };

    const professionRecipeRequirements: Record<number, { profession?: number; rank?: number; item: { name: string; eq_type: number; affix: number; power: number } }> = {
      2: { item: { name: 'Scholar Focus', eq_type: 0, affix: 3, power: 24 } },
      5: { profession: 2, rank: 1, item: { name: "Smith's Sigil", eq_type: 0, affix: 3, power: 30 } },
      9: { profession: 2, rank: 2, item: { name: 'Masterwork Matrix', eq_type: 0, affix: 3, power: 36 } },
    };

    const questRewards = (hero: any, session: any) => {
      const changes: any[] = [];
      const addMaterial = (name: string, material_type: number, value = 2) => {
        const material = createMaterial(address, name, material_type, value);
        changes.push({
          type: 'created',
          owner: { AddressOwner: address },
          objectType: `${packageId}::material::Material`,
          objectId: material.id,
        });
      };

      if (session.contractType === 1 && session.missionType === 1) {
        addMaterial('Battle Notes', 2);
        addMaterial('Battle Notes', 2);
        addMaterial('Armor Scrap', 1);
      } else if (session.contractType === 2 && session.missionType === 2) {
        addMaterial('Iron Ore', 0);
        addMaterial('Armor Scrap', 1);
        addMaterial('Battle Notes', 2);
        addMaterial('Forge Notes', 2);
      } else {
        addMaterial('Battle Notes', 2);
      }

      hero.profession_xp += session.contractType === 2 ? 3 : session.contractType === 1 ? 2 : 1;
      session.status = 'complete';
      return changes;
    };

    const jsonResponse = (body: any, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    (window as any).__ONEREALM_E2E__ = {
      async startLogin(origin: string) {
        sessionStorage.setItem('zkAddress', address);
        sessionStorage.setItem('apiSessionToken', state.apiSessionToken);
        sessionStorage.setItem('apiSessionExpiresAt', String(Date.now() + 60_000));
        sessionStorage.setItem('zkProof', JSON.stringify({ e2e: true }));
        sessionStorage.setItem('zkEphemKey', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
        sessionStorage.setItem('zkMaxEpoch', '999');
        localStorage.setItem('zkSalt', 'e2e-salt');
        window.location.assign(`${origin}/hero`);
      },
      async fetch(url: string, init?: RequestInit) {
        const parsed = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        if (url.endsWith('/api/ai-hint')) {
          return jsonResponse({
            hint: 'E2E mentor online.',
            readiness: 42,
            recommended_quest: 'harvest',
          });
        }
        if (url.endsWith('/api/auth/complete')) {
          return jsonResponse({ sessionToken: state.apiSessionToken, expiresAt: Date.now() + 60_000 });
        }
        if (url.endsWith('/api/session/create')) {
          const sessionId = nextId('session');
          const readyAtMs = parsed.contractType === 2 ? Date.now() + 1000 : 0;
          state.sessions.set(sessionId, {
            id: sessionId,
            heroId: parsed.heroId,
            missionType: parsed.missionType,
            contractType: parsed.contractType,
            stance: parsed.stance,
            readyAtMs,
            status: 'pending',
          });
          return jsonResponse({ sessionId, createTxDigest: `create-${sessionId}`, readyAtMs });
        }
        if (url.endsWith('/api/session/loot')) {
          const session = state.sessions.get(parsed.sessionId);
          if (session) {
            session.status = 'loot_done';
          }
          return jsonResponse({ tx1Digest: `loot-${parsed.sessionId}` });
        }
        throw new Error(`Unhandled E2E fetch: ${url}`);
      },
      async getOwnedObjects(args: any) {
        return {
          data: ownedObjects(args.owner, args.filter.StructType),
        };
      },
      async getObject(args: any) {
        const hero = getHero(args.id);
        if (hero) {
          return {
            data: {
              objectId: hero.id,
              content: {
                fields: {
                  name: b64(hero.name),
                  level: hero.level,
                  base_power: hero.base_power,
                  archetype: hero.archetype,
                  profession: hero.profession,
                  profession_xp: hero.profession_xp,
                },
              },
            },
          };
        }
        const equipment = getEquipment(args.id);
        if (equipment) {
          return {
            data: {
              objectId: equipment.id,
              content: {
                fields: {
                  name: b64(equipment.name),
                  power: equipment.power,
                  rarity: equipment.rarity,
                  eq_type: equipment.eq_type,
                  affix: equipment.affix,
                },
              },
            },
          };
        }
        return {
          data: {
            objectId: args.id,
            content: {
              fields: {},
            },
          },
        };
      },
      async getDynamicFields(args: any) {
        const hero = getHero(args.parentId);
        const data = hero?.slots
          ? Object.entries(hero.slots)
              .filter(([, objectId]) => !!objectId)
              .map(([slot, objectId]) => ({
                objectId,
                name: { value: slot },
              }))
          : [];
        return { data };
      },
      async executeAction(action: any) {
        if (action.target.endsWith('hero::mint_to_sender')) {
          const hero = {
            id: nextId('hero'),
            owner: address,
            name: action.heroName,
            level: 1,
            base_power: 10,
            archetype: action.archetype,
            profession: action.profession,
            profession_xp: 0,
            slots: { weapon: null, armor: null } as Record<string, string | null>,
          };
          state.heroes.push(hero);
          return {
            digest: `tx-${hero.id}`,
            effects: {},
            objectChanges: [{ type: 'created', owner: { AddressOwner: address }, objectType: `${packageId}::hero::Hero`, objectId: hero.id }],
          };
        }
        if (action.target.endsWith('blacksmith::craft_to_sender')) {
          const hero = getHero(action.heroId);
          const recipe = professionRecipeRequirements[action.recipeId];
          if (!hero || !recipe) throw new Error('Unknown craft request');
          if (recipe.profession !== undefined && hero.profession !== recipe.profession) throw new Error('Wrong profession');
          if (recipe.rank !== undefined && professionRank(hero.profession_xp) < recipe.rank) throw new Error('Rank too low');
          removeMaterials(action.materialIds);
          hero.profession_xp += 1;
          const equipment = createEquipment(address, recipe.item.name, recipe.item.eq_type, recipe.item.affix, recipe.item.power);
          return {
            digest: `tx-${equipment.id}`,
            effects: {},
            objectChanges: [{ type: 'created', owner: { AddressOwner: address }, objectType: `${packageId}::equipment::Equipment`, objectId: equipment.id }],
          };
        }
        if (action.target.endsWith('hero::equip')) {
          const hero = getHero(action.heroId);
          const equipment = getEquipment(action.itemId);
          if (hero && equipment) {
            hero.slots[action.slot] = equipment.id;
            equipment.equippedTo = hero.id;
            equipment.slot = action.slot;
          }
          return { digest: 'tx-equip', effects: {}, objectChanges: [] };
        }
        if (action.target.endsWith('hero::unequip_to_sender')) {
          const hero = getHero(action.heroId);
          if (hero?.slots[action.slot]) {
            const equipment = getEquipment(hero.slots[action.slot]);
            if (equipment) {
              equipment.equippedTo = null;
              equipment.slot = null;
            }
            hero.slots[action.slot] = null;
          }
          return { digest: 'tx-unequip', effects: {}, objectChanges: [] };
        }
        if (action.target.endsWith('equipment::salvage_to_sender')) {
          state.equipments = state.equipments.filter((item) => item.id !== action.itemId);
          const material = createMaterial(address, 'Armor Scrap', 1);
          return {
            digest: 'tx-salvage',
            effects: {},
            objectChanges: [{ type: 'created', owner: { AddressOwner: address }, objectType: `${packageId}::material::Material`, objectId: material.id }],
          };
        }
        throw new Error(`Unhandled E2E gasless action: ${action.target}`);
      },
      async buildBattleTxAndExecute(sessionId: string) {
        const session = state.sessions.get(sessionId);
        if (!session) throw new Error('Missing session');
        if (session.contractType === 2 && Date.now() < session.readyAtMs) {
          throw new Error('Expedition not ready');
        }
        const hero = getHero(session.heroId);
        if (!hero) throw new Error('Missing hero');
        const objectChanges = questRewards(hero, session);
        return {
          digest: `battle-${sessionId}`,
          effects: {},
          objectChanges,
        };
      },
    };
  });
});

function createSelectors(page: Page) {
  return {
    loginGoogle: page.getByTestId('login-google-button'),
    heroNameInput: page.getByTestId('hero-name-input'),
    archetypeArcanist: page.getByTestId('hero-archetype-2'),
    professionSmithing: page.getByTestId('hero-profession-2'),
    mintHero: page.getByTestId('hero-mint-primary'),
    activeHeroName: page.getByTestId('hero-active-name'),
    activeHeroRank: page.getByTestId('hero-active-rank'),
    startQuestFromHero: page.getByTestId('hero-start-quest'),
    questMissionHarvest: page.getByTestId('quest-mission-1'),
    questMissionTraining: page.getByTestId('quest-mission-2'),
    questContractBounty: page.getByTestId('quest-contract-1'),
    questContractExpedition: page.getByTestId('quest-contract-2'),
    questStart: page.getByTestId('quest-start-button'),
    questExpeditionPanel: page.getByTestId('quest-expedition-panel'),
    questExpeditionSettle: page.getByTestId('quest-expedition-settle'),
    questResultPanel: page.getByTestId('quest-result-panel'),
    questResultStatus: page.getByTestId('quest-result-status'),
    questViewInventory: page.getByTestId('quest-view-inventory'),
    recipeScholarFocus: page.getByTestId('inventory-recipe-2'),
    recipeScholarFocusCraft: page.getByTestId('inventory-recipe-2-craft'),
    recipeSmithSigil: page.getByTestId('inventory-recipe-5'),
    recipeSmithSigilProfession: page.getByTestId('inventory-recipe-5-profession'),
    recipeSmithSigilRank: page.getByTestId('inventory-recipe-5-rank'),
    inventoryFeedback: page.getByTestId('inventory-feedback'),
  };
}

test('login -> mint -> quest -> craft -> expedition return', async ({ page }) => {
  const ui = createSelectors(page);

  await page.goto('/');
  await ui.loginGoogle.click();
  await page.waitForURL('**/hero');

  await ui.heroNameInput.fill('E2E Smith');
  await ui.archetypeArcanist.click();
  await ui.professionSmithing.click();
  await ui.mintHero.click();

  await expect(ui.activeHeroName).toHaveText('E2E Smith');
  await expect(ui.activeHeroRank).toContainText('Rank Novice');

  await ui.startQuestFromHero.click();
  await ui.questMissionHarvest.click();
  await ui.questContractBounty.click();
  await ui.questStart.click();

  await expect(ui.questResultPanel).toBeVisible({ timeout: 10_000 });
  await expect(ui.questResultStatus).toContainText('Quest Complete');
  await ui.questViewInventory.click();

  await expect(ui.recipeScholarFocus).toBeVisible();
  await ui.recipeScholarFocusCraft.click();
  await expect(ui.inventoryFeedback).toContainText('Crafted new gear');

  await page.getByRole('link', { name: /Back/i }).click();
  await expect(ui.activeHeroRank).toContainText('Rank Adept');

  await ui.startQuestFromHero.click();
  await ui.questMissionTraining.click();
  await ui.questContractExpedition.click();
  await ui.questStart.click();

  await expect(ui.questExpeditionPanel).toBeVisible();
  await expect(ui.questExpeditionSettle).toBeDisabled();
  await page.waitForTimeout(1200);
  await ui.questExpeditionSettle.click();

  await expect(ui.questResultPanel).toBeVisible({ timeout: 10_000 });
  await expect(ui.questResultStatus).toContainText('Quest Complete');
  await ui.questViewInventory.click();

  await expect(ui.recipeSmithSigil).toContainText("Smith's Sigil");
  await expect(ui.recipeSmithSigilProfession).toContainText('Requires Smithing');
  await expect(ui.recipeSmithSigilRank).toContainText('Requires Adept rank');
});
