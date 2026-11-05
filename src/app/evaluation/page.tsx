import Evaluation from '@/components/Evaluation';
import { evaluationSchema } from '@/lib/evaluation';
import live from '../../../evaluation/latest.json';
import mock from '../../../evaluation/mock-test.json';
export default function Page(){return <Evaluation live={evaluationSchema.parse(live)} mock={evaluationSchema.parse(mock)}/>;}
