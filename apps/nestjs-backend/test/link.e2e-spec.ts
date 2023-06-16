/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
import type { INestApplication } from '@nestjs/common';
import type { IRecord } from '@teable-group/core';
import { FieldType, Relationship } from '@teable-group/core';
import type { LinkFieldDto } from 'src/features/field/model/field-dto/link-field.dto';
import request from 'supertest';
import type { CreateFieldRo } from '../src/features/field/model/create-field.ro';
import type { UpdateRecordRo } from '../src/features/record/update-record.ro';
import { initApp } from './init-app';

describe('OpenAPI link (e2e)', () => {
  let app: INestApplication;
  let table1Id = '';
  let table2Id = '';
  jest.useRealTimers();
  beforeAll(async () => {
    app = await initApp();
  });

  afterAll(async () => {
    app.close();
  });

  afterEach(async () => {
    await request(app.getHttpServer()).delete(`/api/table/arbitrary/${table1Id}`);
    await request(app.getHttpServer()).delete(`/api/table/arbitrary/${table2Id}`);
  });

  describe('create table with link field', () => {
    it('should create foreign link field when create a new table with link field', async () => {
      const numberFieldRo: CreateFieldRo = {
        name: 'Number field',
        type: FieldType.Number,
        options: {
          precision: 1,
        },
      };

      const textFieldRo: CreateFieldRo = {
        name: 'text field',
        type: FieldType.SingleLineText,
      };

      const createTable1Result = await request(app.getHttpServer())
        .post('/api/table')
        .send({
          name: 'table1',
          fields: [numberFieldRo, textFieldRo],
        })
        .expect(201);

      table1Id = createTable1Result.body.data.id;

      const linkFieldRo: CreateFieldRo = {
        name: 'link field',
        type: FieldType.Link,
        options: {
          relationship: Relationship.ManyOne,
          foreignTableId: table1Id,
        },
      };

      const createTable2Result = await request(app.getHttpServer())
        .post('/api/table')
        .send({
          name: 'table2',
          fields: [numberFieldRo, textFieldRo, linkFieldRo],
        })
        .expect(201);
      table2Id = createTable2Result.body.data.id;

      const getTable1FieldsResult = await request(app.getHttpServer())
        .get(`/api/table/${table1Id}/field`)
        .expect(200);

      expect(getTable1FieldsResult.body.data).toHaveLength(3);
      expect(getTable1FieldsResult.body.data[2]).toMatchObject({
        name: 'table1',
        type: FieldType.Link,
        options: {
          relationship: Relationship.OneMany,
          foreignTableId: table2Id,
          lookupFieldId: createTable2Result.body.data.fields[0].id,
          dbForeignKeyName: '__fk_' + createTable2Result.body.data.fields[2].id,
          symmetricFieldId: createTable2Result.body.data.fields[2].id,
        },
      });

      expect(createTable2Result.body.data.fields[2]).toMatchObject({
        name: 'link field',
        type: FieldType.Link,
        options: {
          relationship: Relationship.ManyOne,
          foreignTableId: table1Id,
          lookupFieldId: getTable1FieldsResult.body.data[0].id,
          dbForeignKeyName: '__fk_' + createTable2Result.body.data.fields[2].id,
          symmetricFieldId: getTable1FieldsResult.body.data[2].id,
        },
      });
    });

    it('should auto create foreign manyOne link field when create oneMany link field', async () => {
      const numberFieldRo: CreateFieldRo = {
        name: 'Number field',
        type: FieldType.Number,
        options: {
          precision: 1,
        },
      };

      const textFieldRo: CreateFieldRo = {
        name: 'text field',
        type: FieldType.SingleLineText,
      };

      const createTable1Result = await request(app.getHttpServer())
        .post('/api/table')
        .send({
          name: 'table1',
          fields: [numberFieldRo, textFieldRo],
        })
        .expect(201);
      table1Id = createTable1Result.body.data.id;

      const linkFieldRo: CreateFieldRo = {
        name: 'link field',
        type: FieldType.Link,
        options: {
          relationship: Relationship.OneMany,
          foreignTableId: table1Id,
        },
      };

      const createTable2Result = await request(app.getHttpServer())
        .post('/api/table')
        .send({
          name: 'table2',
          fields: [numberFieldRo, textFieldRo, linkFieldRo],
        })
        .expect(201);
      table2Id = createTable2Result.body.data.id;

      const getTable1FieldsResult = await request(app.getHttpServer())
        .get(`/api/table/${table1Id}/field`)
        .expect(200);

      expect(getTable1FieldsResult.body.data).toHaveLength(3);
      expect(getTable1FieldsResult.body.data[2]).toMatchObject({
        name: 'table1',
        type: FieldType.Link,
        options: {
          relationship: Relationship.ManyOne,
          foreignTableId: table2Id,
          lookupFieldId: createTable2Result.body.data.fields[0].id,
          dbForeignKeyName: '__fk_' + getTable1FieldsResult.body.data[2].id,
          symmetricFieldId: createTable2Result.body.data.fields[2].id,
        },
      });

      expect(createTable2Result.body.data.fields[2]).toMatchObject({
        name: 'link field',
        type: FieldType.Link,
        options: {
          relationship: Relationship.OneMany,
          foreignTableId: table1Id,
          lookupFieldId: getTable1FieldsResult.body.data[0].id,
          dbForeignKeyName: '__fk_' + getTable1FieldsResult.body.data[2].id,
          symmetricFieldId: getTable1FieldsResult.body.data[2].id,
        },
      });
    });
  });

  describe('link field cell update', () => {
    let ctx: {
      numberFieldRo: CreateFieldRo;
      textFieldRo: CreateFieldRo;
      table1Records: IRecord[];
      table1linkField: LinkFieldDto;
      linkFieldRo: CreateFieldRo;
      table2Id: string;
      table2Records: IRecord[];
    } = {} as any;
    beforeEach(async () => {
      const numberFieldRo: CreateFieldRo = {
        name: 'Number field',
        type: FieldType.Number,
        options: {
          precision: 1,
        },
      };

      const textFieldRo: CreateFieldRo = {
        name: 'text field',
        type: FieldType.SingleLineText,
      };

      const createTable1Result = await request(app.getHttpServer())
        .post('/api/table')
        .send({
          name: 'table1',
          fields: [textFieldRo, numberFieldRo],
        })
        .expect(201);

      table1Id = createTable1Result.body.data.id;
      const table1Records = createTable1Result.body.data.data.records;

      const table2LinkFieldRo: CreateFieldRo = {
        name: 'link field',
        type: FieldType.Link,
        options: {
          relationship: Relationship.ManyOne,
          foreignTableId: table1Id,
        },
      };

      // table2 link manyOne table1
      const createTable2Result = await request(app.getHttpServer())
        .post('/api/table')
        .send({
          name: 'table2',
          fields: [textFieldRo, numberFieldRo, table2LinkFieldRo],
        })
        .expect(201);
      const linkToRecordId = table1Records[0].id;
      table2Id = createTable2Result.body.data.id;

      const getFields1Result = await request(app.getHttpServer())
        .get(`/api/table/${table1Id}/field`)
        .expect(200);

      const table1linkField = getFields1Result.body.data[2];

      const table2Records = createTable2Result.body.data.data.records;
      // table2 link field first record link to table1 first record
      await request(app.getHttpServer())
        .put(`/api/table/${table2Id}/record/${table2Records[0].id}`)
        .send({
          record: {
            fields: {
              [table2LinkFieldRo.name]: { title: 'test', id: linkToRecordId },
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      const table1RecordResult = await request(app.getHttpServer())
        .get(`/api/table/${table1Id}/record/${linkToRecordId}`)
        .expect(200);

      expect(table1RecordResult.body.data.record.fields[table1linkField.name]).toEqual([
        {
          id: table2Records[0].id,
        },
      ]);

      ctx = {
        numberFieldRo,
        textFieldRo,
        linkFieldRo: table2LinkFieldRo,
        table1linkField,
        table1Records,
        table2Id,
        table2Records,
      };
    });

    it('should update foreign link field when set a new link in to link field cell', async () => {
      await request(app.getHttpServer())
        .put(`/api/table/${table2Id}/record/${ctx.table2Records[0].id}`)
        .send({
          record: {
            fields: {
              [ctx.linkFieldRo.name]: { title: 'test', id: ctx.table1Records[1].id },
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      const table1RecordResult2 = await request(app.getHttpServer())
        .get(`/api/table/${table1Id}/record`)
        .expect(200);

      expect(
        table1RecordResult2.body.data.records[0].fields[ctx.table1linkField.name]
      ).toBeUndefined();
      expect(table1RecordResult2.body.data.records[1].fields[ctx.table1linkField.name]).toEqual([
        {
          id: ctx.table2Records[0].id,
        },
      ]);
    });

    it('should update foreign link field when change lookupField value', async () => {
      // set text for lookup field
      await request(app.getHttpServer())
        .put(`/api/table/${table2Id}/record/${ctx.table2Records[0].id}`)
        .send({
          record: {
            fields: {
              [ctx.textFieldRo.name]: 'B1',
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/table/${table2Id}/record/${ctx.table2Records[1].id}`)
        .send({
          record: {
            fields: {
              [ctx.textFieldRo.name]: 'B2',
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      // add an extra link for table1 record1
      await request(app.getHttpServer())
        .put(`/api/table/${table2Id}/record/${ctx.table2Records[1].id}`)
        .send({
          record: {
            fields: {
              [ctx.linkFieldRo.name]: { title: 'test', id: ctx.table1Records[0].id },
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      const table1RecordResult2 = await request(app.getHttpServer())
        .get(`/api/table/${table1Id}/record`)
        .expect(200);

      expect(table1RecordResult2.body.data.records[0].fields[ctx.table1linkField.name]).toEqual([
        {
          title: 'B1',
          id: ctx.table2Records[0].id,
        },
        {
          title: 'B2',
          id: ctx.table2Records[1].id,
        },
      ]);

      await request(app.getHttpServer())
        .put(`/api/table/${table1Id}/record/${ctx.table1Records[0].id}`)
        .send({
          record: {
            fields: {
              [ctx.textFieldRo.name]: 'AX',
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      const table2RecordResult2 = await request(app.getHttpServer())
        .get(`/api/table/${table2Id}/record`)
        .expect(200);

      expect(table2RecordResult2.body.data.records[0].fields[ctx.linkFieldRo.name]).toEqual({
        title: 'AX',
        id: ctx.table1Records[0].id,
      });
    });

    it('should update self foreign link with correct title', async () => {
      // set text for lookup field
      await request(app.getHttpServer())
        .put(`/api/table/${table2Id}/record/${ctx.table2Records[0].id}`)
        .send({
          record: {
            fields: {
              [ctx.textFieldRo.name]: 'B1',
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/table/${table2Id}/record/${ctx.table2Records[1].id}`)
        .send({
          record: {
            fields: {
              [ctx.textFieldRo.name]: 'B2',
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/api/table/${table1Id}/record/${ctx.table1Records[0].id}`)
        .send({
          record: {
            fields: {
              [ctx.table1linkField.name]: [
                { title: 'B1', id: ctx.table2Records[0].id },
                { title: 'B2', id: ctx.table2Records[1].id },
              ],
            },
          },
        } as UpdateRecordRo)
        .expect(200);

      const table1RecordResult2 = await request(app.getHttpServer())
        .get(`/api/table/${table1Id}/record`)
        .expect(200);

      expect(table1RecordResult2.body.data.records[0].fields[ctx.table1linkField.name]).toEqual([
        {
          title: 'B1',
          id: ctx.table2Records[0].id,
        },
        {
          title: 'B2',
          id: ctx.table2Records[1].id,
        },
      ]);
    });
  });
});