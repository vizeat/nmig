/*
 * This file is a part of "NMIG" - the database migration tool.
 *
 * Copyright (C) 2016 - present, Anatoly Khaytovich <anatolyuss@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program (please see the "LICENSE.md" file).
 * If not, see <http://www.gnu.org/licenses/gpl.txt>.
 *
 * @author Anatoly Khaytovich <anatolyuss@gmail.com>
 */
import log from './Logger';
import Conversion from './Conversion';
import DBAccess from './DBAccess';
import DBVendors from './DBVendors';
import DBAccessQueryResult from './DBAccessQueryResult';
import * as extraConfigProcessor from './ExtraConfigProcessor';

/**
 * Creates primary key and indices.
 */
export default async function(conversion: Conversion, tableName: string): Promise<void> {
    const dbAccess: DBAccess = new DBAccess(conversion);
    const logTitle: string = 'IndexAndKeyProcessor'
    const originalTableName: string = extraConfigProcessor.getTableName(conversion, tableName, true);
    const sqlShowIndex: string = `SHOW INDEX FROM \`${ originalTableName }\`;`;
    const showIndexResult: DBAccessQueryResult = await dbAccess.query(logTitle, sqlShowIndex, DBVendors.MYSQL, false, false);

    if (showIndexResult.error) {
        return;
    }

    const objPgIndices: any = Object.create(null);
    let cnt: number = 0;
    let indexType: string = '';

    showIndexResult.data.forEach((index: any) => {
        const pgColumnName: string = extraConfigProcessor.getColumnName(conversion, originalTableName, index.Column_name, false);

        if (index.Key_name in objPgIndices) {
            objPgIndices[index.Key_name].column_name.push(`"${ pgColumnName }"`);
            return;
        }

        objPgIndices[index.Key_name] = {
            is_unique: index.Non_unique === 0,
            column_name: [`"${ pgColumnName }"`],
            Index_type: ` USING ${ index.Index_type === 'SPATIAL' ? 'GIST' : index.Index_type }`
        };
    });

    const addIndexPromises: Promise<void>[] = Object.keys(objPgIndices).map(async (index: string) => {
        let sqlAddIndex: string = '';

        if (index.toLowerCase() === 'primary') {
            indexType = 'PK';
            sqlAddIndex = `ALTER TABLE "${ conversion._schema }"."${ tableName }" 
                ADD PRIMARY KEY(${ objPgIndices[index].column_name.join(',') });`;
        } else {
            // "schema_idxname_{integer}_idx" - is NOT a mistake.
            const columnName: string = objPgIndices[index].column_name[0].slice(1, -1) + cnt++;
            indexType = 'index';
            sqlAddIndex = `CREATE ${ (objPgIndices[index].is_unique ? 'UNIQUE ' : '') }INDEX "${ conversion._schema }_${ tableName }_${ columnName }_idx" 
            ON "${ conversion._schema }"."${ tableName }" 
            ${ objPgIndices[index].Index_type } (${ objPgIndices[index].column_name.join(',') });`;
        }

        await dbAccess.query(logTitle, sqlAddIndex, DBVendors.PG, false, false);
    });

    await Promise.all(addIndexPromises);
    const successMsg: string = `\t--[${ logTitle }] "${ conversion._schema }"."${ tableName }": PK/indices are successfully set...`;
    log(conversion, successMsg, conversion._dicTables[tableName].tableLogPath);
}
