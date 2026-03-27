import { expect, test } from '@playwright/test';

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
      async executeGasless(txBytes: string) {
        const action = JSON.parse(atob(txBytes));
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

test('login -> mint -> quest -> craft -> expedition return', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /login with google/i }).click();
  await page.waitForURL('**/hero');

  await page.getByPlaceholder('Hero name...').fill('E2E Smith');
  await page.getByRole('button', { name: /Arcanist/i }).click();
  await page.getByRole('button', { name: /Smithing/i }).click();
  await page.getByRole('button', { name: /Mint \(Free\)/i }).click();

  await expect(page.getByText('E2E Smith')).toBeVisible();
  await expect(page.getByText(/Rank Novice/i)).toBeVisible();

  await page.getByRole('button', { name: /Start Quest/i }).click();
  await page.getByRole('heading', { name: 'Harvest' }).click();
  await page.getByRole('button', { name: /Bounty/i }).click();
  await page.getByRole('button', { name: /Start Quest \(Gasless\)/i }).click();

  await expect(page.getByText(/Quest Complete!/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /View Inventory/i }).click();

  const scholarFocus = page.locator('div').filter({ hasText: 'Scholar Focus' }).first();
  await scholarFocus.getByRole('button', { name: 'Craft' }).click();
  await expect(page.getByText(/Crafted new gear/i)).toBeVisible();

  await page.getByRole('link', { name: /Back/i }).click();
  await expect(page.getByText(/Rank Adept/i)).toBeVisible();

  await page.getByRole('button', { name: /Start Quest/i }).click();
  await page.getByRole('heading', { name: 'Training' }).click();
  await page.getByRole('button', { name: /Expedition/i }).click();
  await page.getByRole('button', { name: /Start Quest \(Gasless\)/i }).click();

  await expect(page.getByText(/Expedition Underway/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Waiting for Return/i })).toBeDisabled();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Resolve Expedition/i }).click();

  await expect(page.getByText(/Quest Complete!/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /View Inventory/i }).click();

  const smithSigil = page.locator('div').filter({ hasText: "Smith's Sigil" }).first();
  await expect(smithSigil).toContainText("Smith's Sigil");
  await expect(smithSigil).toContainText('Requires Smithing');
  await expect(smithSigil).toContainText('Requires Adept rank');
});
