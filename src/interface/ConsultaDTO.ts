/**
 * Interface DTO para transferência de dados do Consulta
 */
export interface ConsultaDTO {
    idConsulta?: number;
    dataHora: string;
    duracaoMinutos: number;
    status?: 'Pendente' | 'Confirmado' | 'Cancelado' | 'Concluido';
    modalidade?: 'Pessoalmente' | 'Telemedicina';
    triagemSintomas: string;
    situacao?: boolean;

    paciente: {
        idPaciente: number;
        nomePaciente: string;
        cpf: string;
        telefone?: string;
        dataNascimento: string;
        situacao?: boolean;
    };

    medico: {
        idMedico: number;
        nomeMedico: string;
        crm: string;
        especialidade: string;
        valorConsulta: number;
        situacao?: boolean;
    };
}
