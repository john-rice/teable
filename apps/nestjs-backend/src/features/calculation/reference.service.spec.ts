/* eslint-disable @typescript-eslint/naming-convention */
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { IRecord } from '@teable-group/core';
import { FieldType, Relationship } from '@teable-group/core';
import type { Knex } from 'knex';
import knex from 'knex';
import { PrismaService } from '../../prisma.service';
import type { IFieldInstance } from '../field/model/factory';
import { createFieldInstanceByRo } from '../field/model/factory';
import type { ITopoItemWithRecords } from './reference.service';
import { ReferenceService } from './reference.service';

describe('ReferenceService', () => {
  describe('ReferenceService data retrieval', () => {
    let service: ReferenceService;
    let prisma: PrismaService;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let initialReferences: {
      fromFieldId: string;
      toFieldId: string;
    }[];
    let db: ReturnType<typeof knex>;
    const s = JSON.stringify;

    beforeAll(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ReferenceService, PrismaService],
      }).compile();

      service = module.get<ReferenceService>(ReferenceService);
      prisma = module.get<PrismaService>(PrismaService);
      db = knex({
        client: 'sqlite3',
      });
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function executeKnex(builder: Knex.SchemaBuilder | Knex.QueryBuilder) {
      const sql = builder.toSQL();
      if (Array.isArray(sql)) {
        for (const item of sql) {
          await prisma.$executeRawUnsafe(item.sql, ...item.bindings);
        }
      } else {
        const nativeSql = sql.toNative();
        await prisma.$executeRawUnsafe(nativeSql.sql, ...nativeSql.bindings);
      }
    }

    beforeEach(async () => {
      // create tables
      await executeKnex(
        db.schema.createTable('A', (table) => {
          table.string('__id').primary();
          table.string('fieldA');
          table.string('oneToManyB');
        })
      );
      await executeKnex(
        db.schema.createTable('B', (table) => {
          table.string('__id').primary();
          table.string('fieldB');
          table.string('manyToOneA');
          table.string('__fk_manyToOneA');
          table.string('oneToManyC');
        })
      );
      await executeKnex(
        db.schema.createTable('C', (table) => {
          table.string('__id').primary();
          table.string('fieldC');
          table.string('manyToOneB');
          table.string('__fk_manyToOneB');
        })
      );

      initialReferences = [
        { fromFieldId: 'f1', toFieldId: 'f2' },
        { fromFieldId: 'f2', toFieldId: 'f3' },
        { fromFieldId: 'f2', toFieldId: 'f4' },
        { fromFieldId: 'f3', toFieldId: 'f6' },
        { fromFieldId: 'f5', toFieldId: 'f4' },
        { fromFieldId: 'f7', toFieldId: 'f8' },
      ];

      for (const data of initialReferences) {
        await prisma.reference.create({
          data,
        });
      }
    });

    afterEach(async () => {
      // Delete test data
      for (const data of initialReferences) {
        await prisma.reference.deleteMany({
          where: { fromFieldId: data.fromFieldId, AND: { toFieldId: data.toFieldId } },
        });
      }
      // delete data
      await executeKnex(db('A').truncate());
      await executeKnex(db('B').truncate());
      await executeKnex(db('C').truncate());
      // delete table
      await executeKnex(db.schema.dropTable('A'));
      await executeKnex(db.schema.dropTable('B'));
      await executeKnex(db.schema.dropTable('C'));
    });

    it('topological order with dependencies:', async () => {
      const graph = [
        { fromFieldId: 'a', toFieldId: 'c' },
        { fromFieldId: 'b', toFieldId: 'c' },
        { fromFieldId: 'c', toFieldId: 'd' },
      ];

      const sortedNodes = service['getTopologicalOrder']('a', graph);

      expect(sortedNodes).toEqual([
        { id: 'a', dependencies: [] },
        { id: 'c', dependencies: ['a', 'b'] },
        { id: 'd', dependencies: ['c'] },
      ]);
    });

    it('many to one link relationship order for getAffectedRecords', async () => {
      // fill data
      await executeKnex(
        db('A').insert([
          { __id: 'idA1', fieldA: 'A1', oneToManyB: s(['B1', 'B2']) },
          { __id: 'idA2', fieldA: 'A2', oneToManyB: s(['B3']) },
        ])
      );
      await executeKnex(
        db('B').insert([
          /* eslint-disable prettier/prettier */
          {
            __id: 'idB1',
            fieldB: 'A1',
            manyToOneA: 'A1',
            __fk_manyToOneA: 'idA1',
            oneToManyC: s(['C1', 'C2']),
          },
          {
            __id: 'idB2',
            fieldB: 'A1',
            manyToOneA: 'A1',
            __fk_manyToOneA: 'idA1',
            oneToManyC: s(['C3']),
          },
          {
            __id: 'idB3',
            fieldB: 'A2',
            manyToOneA: 'A2',
            __fk_manyToOneA: 'idA2',
            oneToManyC: s(['C4']),
          },
          { __id: 'idB4', fieldB: null, manyToOneA: null, __fk_manyToOneA: null, oneToManyC: null },
          /* eslint-enable prettier/prettier */
        ])
      );
      await executeKnex(
        db('C').insert([
          { __id: 'idC1', fieldC: 'C1', manyToOneB: 'A1', __fk_manyToOneB: 'idB1' },
          { __id: 'idC2', fieldC: 'C2', manyToOneB: 'A1', __fk_manyToOneB: 'idB1' },
          { __id: 'idC3', fieldC: 'C3', manyToOneB: 'A1', __fk_manyToOneB: 'idB2' },
          { __id: 'idC4', fieldC: 'C4', manyToOneB: 'A2', __fk_manyToOneB: 'idB3' },
        ])
      );

      const topoOrder = [
        {
          dbTableName: 'B',
          fieldId: 'manyToOneA',
          foreignKeyField: '__fk_manyToOneA',
          relationship: Relationship.ManyOne,
          linkedTable: 'A',
          dependencies: ['fieldA'],
        },
        {
          dbTableName: 'C',
          fieldId: 'manyToOneB',
          foreignKeyField: '__fk_manyToOneB',
          relationship: Relationship.ManyOne,
          linkedTable: 'B',
          dependencies: ['fieldB'],
        },
      ];

      const records = await service['getAffectedRecordItems'](
        prisma,
        [{ id: 'idA1', dbTableName: 'A' }],
        topoOrder
      );

      expect(records).toEqual([
        { id: 'idB1', dbTableName: 'B', fieldId: 'manyToOneA', relationTo: 'idA1' },
        { id: 'idB2', dbTableName: 'B', fieldId: 'manyToOneA', relationTo: 'idA1' },
        { id: 'idC1', dbTableName: 'C', fieldId: 'manyToOneB', relationTo: 'idB1' },
        { id: 'idC2', dbTableName: 'C', fieldId: 'manyToOneB', relationTo: 'idB1' },
        { id: 'idC3', dbTableName: 'C', fieldId: 'manyToOneB', relationTo: 'idB2' },
      ]);

      const recordsWithMultiInput = await service['getAffectedRecordItems'](
        prisma,
        [
          { id: 'idA1', dbTableName: 'A' },
          { id: 'idA2', dbTableName: 'A' },
        ],
        topoOrder
      );

      expect(recordsWithMultiInput).toEqual([
        { id: 'idB1', dbTableName: 'B', relationTo: 'idA1', fieldId: 'manyToOneA' },
        { id: 'idB2', dbTableName: 'B', relationTo: 'idA1', fieldId: 'manyToOneA' },
        { id: 'idB3', dbTableName: 'B', relationTo: 'idA2', fieldId: 'manyToOneA' },
        { id: 'idC1', dbTableName: 'C', relationTo: 'idB1', fieldId: 'manyToOneB' },
        { id: 'idC2', dbTableName: 'C', relationTo: 'idB1', fieldId: 'manyToOneB' },
        { id: 'idC3', dbTableName: 'C', relationTo: 'idB2', fieldId: 'manyToOneB' },
        { id: 'idC4', dbTableName: 'C', relationTo: 'idB3', fieldId: 'manyToOneB' },
      ]);
    });

    it('one to many link relationship order for getAffectedRecords', async () => {
      await executeKnex(
        db('A').insert([{ __id: 'idA1', fieldA: 'A1', oneToManyB: s(['C1, C2', 'C3']) }])
      );
      await executeKnex(
        db('B').insert([
          /* eslint-disable prettier/prettier */
          {
            __id: 'idB1',
            fieldB: 'C1, C2',
            manyToOneA: 'A1',
            __fk_manyToOneA: 'idA1',
            oneToManyC: s(['C1', 'C2']),
          },
          {
            __id: 'idB2',
            fieldB: 'C3',
            manyToOneA: 'A1',
            __fk_manyToOneA: 'idA1',
            oneToManyC: s(['C3']),
          },
          /* eslint-enable prettier/prettier */
        ])
      );
      await executeKnex(
        db('C').insert([
          { __id: 'idC1', fieldC: 'C1', manyToOneB: 'C1, C2', __fk_manyToOneB: 'idB1' },
          { __id: 'idC2', fieldC: 'C2', manyToOneB: 'C1, C2', __fk_manyToOneB: 'idB1' },
          { __id: 'idC3', fieldC: 'C3', manyToOneB: 'C3', __fk_manyToOneB: 'idB2' },
        ])
      );
      // topoOrder Graph:
      // C.fieldC -> B.oneToManyC -> B.fieldB -> A.oneToManyB
      //                                      -> C.manyToOneB
      const topoOrder = [
        {
          dbTableName: 'B',
          fieldId: 'oneToManyC',
          foreignKeyField: '__fk_manyToOneB',
          relationship: Relationship.OneMany,
          linkedTable: 'C',
        },
        {
          dbTableName: 'A',
          fieldId: 'oneToManyB',
          foreignKeyField: '__fk_manyToOneA',
          relationship: Relationship.OneMany,
          linkedTable: 'B',
        },
        {
          dbTableName: 'C',
          fieldId: 'manyToOneB',
          foreignKeyField: '__fk_manyToOneB',
          relationship: Relationship.ManyOne,
          linkedTable: 'B',
        },
      ];

      const records = await service['getAffectedRecordItems'](
        prisma,
        [{ id: 'idC1', dbTableName: 'C' }],
        topoOrder
      );

      // manyToOneB: ['B1', 'B2']
      expect(records).toEqual([
        { id: 'idB1', dbTableName: 'B', fieldId: 'oneToManyC', selectIn: 'C.__fk_manyToOneB' },
        { id: 'idA1', dbTableName: 'A', fieldId: 'oneToManyB', selectIn: 'B.__fk_manyToOneA' },
        { id: 'idC1', dbTableName: 'C', fieldId: 'manyToOneB', relationTo: 'idB1' },
        { id: 'idC2', dbTableName: 'C', fieldId: 'manyToOneB', relationTo: 'idB1' },
      ]);

      const extraRecords = await service['getDependentRecordItems'](prisma, records);

      expect(extraRecords).toEqual([
        { id: 'idB1', dbTableName: 'B', fieldId: 'oneToManyB', relationTo: 'idA1' },
        { id: 'idB2', dbTableName: 'B', fieldId: 'oneToManyB', relationTo: 'idA1' },
        { id: 'idC1', dbTableName: 'C', fieldId: 'oneToManyC', relationTo: 'idB1' },
        { id: 'idC2', dbTableName: 'C', fieldId: 'oneToManyC', relationTo: 'idB1' },
      ]);
    });

    it('getDependentNodesCTE should return all dependent nodes', async () => {
      const result = await service['getDependentNodesCTE'](prisma, 'f2');
      const resultData = [...initialReferences];
      resultData.pop();
      expect(result).toEqual(expect.arrayContaining(resultData));
    });
  });

  describe('ReferenceService calculation', () => {
    let service: ReferenceService;
    let fieldMap: { [oneToMany: string]: IFieldInstance };
    let fieldId2TableId: { [fieldId: string]: string };
    let recordMap: { [recordId: string]: IRecord };
    let ordersWithRecords: ITopoItemWithRecords[];

    beforeAll(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ReferenceService, PrismaService],
      }).compile();

      service = module.get<ReferenceService>(ReferenceService);
    });

    beforeEach(() => {
      fieldMap = {
        fieldA: createFieldInstanceByRo({
          id: 'fieldA',
          name: 'fieldA',
          type: FieldType.Link,
          options: {
            relationship: Relationship.OneMany,
            foreignTableId: 'foreignTable1',
            lookupFieldId: 'lookupField1',
            dbForeignKeyName: 'dbForeignKeyName1',
            symmetricFieldId: 'symmetricField1',
          },
        }),
        // {
        //   dbTableName: 'A',
        //   fieldId: 'oneToManyB',
        //   foreignKeyField: '__fk_manyToOneA',
        //   relationship: Relationship.OneMany,
        //   linkedTable: 'B',
        // },
        oneToManyB: createFieldInstanceByRo({
          id: 'oneToManyB',
          name: 'oneToManyB',
          type: FieldType.Link,
          options: {
            relationship: Relationship.OneMany,
            foreignTableId: 'B',
            lookupFieldId: 'fieldB',
            dbForeignKeyName: '__fk_manyToOneA',
            symmetricFieldId: 'manyToOneA',
          },
        }),
        // fieldB is a special field depend on oneToManyC, may be convert it to formula field
        fieldB: createFieldInstanceByRo({
          id: 'fieldB',
          name: 'fieldB',
          type: FieldType.Formula,
          options: {
            expression: '{oneToManyC}',
          },
        }),
        manyToOneA: createFieldInstanceByRo({
          id: 'manyToOneA',
          name: 'manyToOneA',
          type: FieldType.Link,
          options: {
            relationship: Relationship.ManyOne,
            foreignTableId: 'A',
            lookupFieldId: 'fieldA',
            dbForeignKeyName: '__fk_manyToOneA',
            symmetricFieldId: 'oneToManyB',
          },
        }),
        // {
        //   dbTableName: 'B',
        //   fieldId: 'oneToManyC',
        //   foreignKeyField: '__fk_manyToOneB',
        //   relationship: Relationship.OneMany,
        //   linkedTable: 'C',
        // },
        oneToManyC: createFieldInstanceByRo({
          id: 'oneToManyC',
          name: 'oneToManyC',
          type: FieldType.Link,
          options: {
            relationship: Relationship.OneMany,
            foreignTableId: 'C',
            lookupFieldId: 'fieldC',
            dbForeignKeyName: '__fk_manyToOneB',
            symmetricFieldId: 'manyToOneB',
          },
        }),
        fieldC: createFieldInstanceByRo({
          id: 'fieldC',
          name: 'fieldC',
          type: FieldType.SingleLineText,
        }),
        // {
        //   dbTableName: 'C',
        //   fieldId: 'manyToOneB',
        //   foreignKeyField: '__fk_manyToOneB',
        //   relationship: Relationship.ManyOne,
        //   linkedTable: 'B',
        // },
        manyToOneB: createFieldInstanceByRo({
          id: 'manyToOneB',
          name: 'manyToOneB',
          type: FieldType.Link,
          options: {
            relationship: Relationship.ManyOne,
            foreignTableId: 'B',
            lookupFieldId: 'fieldB',
            dbForeignKeyName: '__fk_manyToOneB',
            symmetricFieldId: 'oneToManyC',
          },
        }),
      };

      fieldId2TableId = {
        fieldA: 'A',
        oneToManyB: 'A',
        fieldB: 'B',
        manyToOneA: 'B',
        oneToManyC: 'B',
        fieldC: 'C',
        manyToOneB: 'C',
      };

      recordMap = {
        // use new value fieldC: 'CX' here
        idC1: { id: 'idC1', fields: { fieldC: 'CX', manyToOneB: 'C1, C2' }, recordOrder: {} },
        idC2: { id: 'idC2', fields: { fieldC: 'C2', manyToOneB: 'C1, C2' }, recordOrder: {} },
        idB1: {
          id: 'idB1',
          fields: { fieldB: 'C1, C2', manyToOneA: 'A1', oneToManyC: ['C1', 'C2'] },
          recordOrder: {},
        },
        idB2: {
          id: 'idB2',
          fields: { fieldB: 'C3', manyToOneA: 'A1', oneToManyC: ['C3'] },
          recordOrder: {},
        },
        idC3: {
          id: 'idC3',
          fields: { fieldC: 'C3', manyToOneB: 'C3' },
          recordOrder: {},
        },
        idA1: {
          id: 'idA1',
          fields: { fieldA: 'A1', oneToManyB: ['C1, C2', 'C3'] },
          recordOrder: {},
        },
      };

      // topoOrder Graph:
      // C.fieldC -> B.oneToManyC -> B.fieldB -> A.oneToManyB
      //                                      -> C.manyToOneB
      ordersWithRecords = [
        {
          id: 'oneToManyC',
          dependencies: ['fieldC'],
          recordItems: [
            {
              record: recordMap['idB1'],
              dependencies: [recordMap['idC1'], recordMap['idC2']],
            },
          ],
        },
        {
          id: 'fieldB',
          dependencies: ['oneToManyC'],
          recordItems: [
            {
              record: recordMap['idB1'],
            },
          ],
        },
        {
          id: 'oneToManyB',
          dependencies: ['fieldB'],
          recordItems: [
            {
              record: recordMap['idA1'],
              dependencies: [recordMap['idB1'], recordMap['idB2']],
            },
          ],
        },
        {
          id: 'manyToOneB',
          dependencies: ['fieldB'],
          recordItems: [
            {
              record: recordMap['idC1'],
              dependencies: recordMap['idB1'],
            },
            {
              record: recordMap['idC2'],
              dependencies: recordMap['idB1'],
            },
          ],
        },
      ];
    });

    it('should correctly collect changes for Link and Computed fields', () => {
      // 2. Act
      const changes = service['collectChanges'](ordersWithRecords, fieldMap, fieldId2TableId);
      // 3. Assert
      // topoOrder Graph:
      // C.fieldC -> B.oneToManyC -> B.fieldB -> A.oneToManyB
      //                                      -> C.manyToOneB
      // change from: idC1.fieldC      = 'C1' -> 'CX'
      // change affected:
      // idB1.oneToManyC  = ['C1', 'C2'] -> ['CX', 'C2']
      // idB1.fieldB      = 'C1, C2' -> 'CX, C2'
      // idA1.oneToManyB  = ['C1, C2', 'C3'] -> ['CX, C2', 'C3']
      // idC1.manyToOneB  = 'C1, C2' -> 'CX, C2'
      // idC2.manyToOneB  = 'C1, C2' -> 'CX, C2'
      expect(changes).toEqual([
        {
          tableId: 'B',
          recordId: 'idB1',
          fieldId: 'oneToManyC',
          oldValue: ['C1', 'C2'],
          newValue: ['CX', 'C2'],
        },
        {
          tableId: 'B',
          recordId: 'idB1',
          fieldId: 'fieldB',
          oldValue: 'C1, C2',
          newValue: 'CX, C2',
        },
        {
          tableId: 'A',
          recordId: 'idA1',
          fieldId: 'oneToManyB',
          oldValue: ['C1, C2', 'C3'],
          newValue: ['CX, C2', 'C3'],
        },
        {
          tableId: 'C',
          recordId: 'idC1',
          fieldId: 'manyToOneB',
          oldValue: 'C1, C2',
          newValue: 'CX, C2',
        },
        {
          tableId: 'C',
          recordId: 'idC2',
          fieldId: 'manyToOneB',
          oldValue: 'C1, C2',
          newValue: 'CX, C2',
        },
      ]);
    });

    it('should createTopoItemWithRecords from prepared context', () => {
      const tableId2DbTableName = {
        A: 'A',
        B: 'B',
        C: 'C',
      };
      const dbTableName2records = {
        A: [recordMap['idA1']],
        B: [recordMap['idB1'], recordMap['idB2']],
        C: [recordMap['idC1'], recordMap['idC2'], recordMap['idC3']],
      };
      const affectedRecordItems = [
        { id: 'idB1', dbTableName: 'B', fieldId: 'oneToManyC', selectIn: 'C.__fk_manyToOneB' },
        { id: 'idA1', dbTableName: 'A', fieldId: 'oneToManyB', selectIn: 'B.__fk_manyToOneA' },
        { id: 'idC1', dbTableName: 'C', fieldId: 'manyToOneB', relationTo: 'idB1' },
        { id: 'idC2', dbTableName: 'C', fieldId: 'manyToOneB', relationTo: 'idB1' },
      ];

      const dependentRecordItems = [
        { id: 'idB1', dbTableName: 'B', fieldId: 'oneToManyB', relationTo: 'idA1' },
        { id: 'idB2', dbTableName: 'B', fieldId: 'oneToManyB', relationTo: 'idA1' },
        { id: 'idC1', dbTableName: 'C', fieldId: 'oneToManyC', relationTo: 'idB1' },
        { id: 'idC2', dbTableName: 'C', fieldId: 'oneToManyC', relationTo: 'idB1' },
      ];

      // topoOrder Graph:
      // C.fieldC -> B.oneToManyC -> B.fieldB -> A.oneToManyB
      //                                      -> C.manyToOneB
      const topoOrders = [
        {
          id: 'oneToManyC',
          dependencies: ['fieldC'],
        },
        {
          id: 'fieldB',
          dependencies: ['oneToManyC'],
        },
        {
          id: 'oneToManyB',
          dependencies: ['fieldB'],
        },
        {
          id: 'manyToOneB',
          dependencies: ['fieldB'],
        },
      ];

      const topoItems = service['createTopoItemWithRecords']({
        tableId2DbTableName,
        dbTableName2records,
        affectedRecordItems,
        dependentRecordItems,
        fieldMap,
        fieldId2TableId,
        topoOrders,
      });

      expect(topoItems).toEqual(ordersWithRecords);
    });
  });

  describe('ReferenceService simple formula calculation', () => {
    let service: ReferenceService;
    let fieldMap: { [oneToMany: string]: IFieldInstance };
    let fieldId2TableId: { [fieldId: string]: string };
    let recordMap: { [recordId: string]: IRecord };
    let ordersWithRecords: ITopoItemWithRecords[];

    beforeAll(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ReferenceService, PrismaService],
      }).compile();

      service = module.get<ReferenceService>(ReferenceService);
    });

    beforeEach(() => {
      fieldMap = {
        fieldA: createFieldInstanceByRo({
          id: 'fieldA',
          name: 'fieldA',
          type: FieldType.Number,
          options: {
            precision: 1,
          },
        }),
        fieldB: createFieldInstanceByRo({
          id: 'fieldB',
          name: 'fieldB',
          type: FieldType.Formula,
          options: {
            expression: '{fieldA}',
          },
        }),
      };

      fieldId2TableId = {
        fieldA: 'A',
        fieldB: 'A',
      };

      recordMap = {
        // use new value fieldA: 1 here
        idA1: { id: 'idA1', fields: { fieldA: 1, fieldB: null }, recordOrder: {} },
      };

      // topoOrder Graph:
      // A.fieldA -> A.fieldB
      ordersWithRecords = [
        {
          id: 'fieldB',
          dependencies: ['fieldA'],
          recordItems: [
            {
              record: recordMap['idA1'],
            },
          ],
        },
      ];
    });

    it('should correctly collect changes for Computed fields', () => {
      const changes = service['collectChanges'](ordersWithRecords, fieldMap, fieldId2TableId);
      expect(changes).toEqual([
        {
          tableId: 'A',
          recordId: 'idA1',
          fieldId: 'fieldB',
          oldValue: null,
          newValue: 1,
        },
      ]);
    });
  });
});